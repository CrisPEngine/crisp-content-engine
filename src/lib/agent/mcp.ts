import { createHmac } from 'crypto';
import { resolveAgentCredential } from './credentials';
import { agentErrorFromUnknown } from './errors';
import { executeFromAuthorization, type AgentResponseBody } from './execute';
import { jsonSchemaFor, AGENT_ACTIONS } from './registry';

export const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18'] as const;

type JsonRpc = {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpc['id'], result: unknown): string {
	return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(id: JsonRpc['id'], code: number, message: string, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), {
		status,
		headers: { 'content-type': 'application/json', ...extraHeaders },
	});
}

function toolResult(body: AgentResponseBody) {
	return {
		content: [{ type: 'text', text: JSON.stringify(body) }],
		structuredContent: body,
		isError: !body.ok,
	};
}

function wwwAuthenticate(request: Request): string {
	const origin = new URL(request.url).origin;
	return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="cce:brands:read cce:research cce:content:read"`;
}

export function signAgentWebhook(secret: string, body: string): string {
	return createHmac('sha256', secret).update(body).digest('hex');
}

export async function handleMcpHttp(request: Request): Promise<Response> {
	if (request.method === 'GET' || request.method === 'DELETE') {
		return rpcError(null, -32000, 'This server is stateless. Send MCP JSON-RPC with POST.', 405);
	}
	if (request.method !== 'POST') return rpcError(null, -32000, 'Method not allowed.', 405);

	let message: JsonRpc;
	try {
		message = (await request.json()) as JsonRpc;
	} catch {
		return rpcError(null, -32700, 'Invalid JSON.', 400);
	}
	if (message.jsonrpc !== '2.0' || !message.method) return rpcError(message.id, -32600, 'Invalid JSON-RPC request.', 400);
	if (Array.isArray(message)) return rpcError(null, -32600, 'Batch requests are not supported.', 400);

	const accept = request.headers.get('accept') ?? 'application/json';
	const respond = (payload: string, status = 200) => {
		if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
			return new Response(`event: message\ndata: ${payload}\n\n`, {
				status,
				headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
			});
		}
		return new Response(payload, { status, headers: { 'content-type': 'application/json' } });
	};

	if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
		return new Response(null, { status: 202 });
	}

	if (message.method === 'ping') return respond(rpcResult(message.id, {}));

	if (message.method === 'initialize') {
		const requested = typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '';
		const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested as (typeof MCP_PROTOCOL_VERSIONS)[number]) ? requested : MCP_PROTOCOL_VERSIONS[1];
		return respond(
			rpcResult(message.id, {
				protocolVersion,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: 'cce-agent', version: '1.0.0' },
				instructions: 'CCE is the system of record. Call CCE tools. Do not invent brand strategy, and do not ask CCE to run a named model.',
			}),
		);
	}

	if (message.method === 'tools/list' || message.method === 'tools/call') {
		let credential;
		try {
			credential = await resolveAgentCredential(request.headers.get('authorization'));
		} catch (error) {
			const agentError = agentErrorFromUnknown(error);
			const headers = agentError.status === 401 ? { 'WWW-Authenticate': wwwAuthenticate(request) } : undefined;
			return rpcError(message.id, -32001, agentError.message, agentError.status, headers);
		}
		if (message.method === 'tools/list') {
			return respond(
				rpcResult(message.id, {
					tools: AGENT_ACTIONS.filter((definition) => credential.capabilities.includes(definition.capability)).map((definition) => ({
						name: definition.name,
						description: definition.description,
						inputSchema: jsonSchemaFor(definition.schema),
					})),
				}),
			);
		}
	}

	if (message.method !== 'tools/call') {
		return rpcError(message.id, -32601, `Unknown method ${message.method}.`, 400);
	}

	const params = message.params ?? {};
	const name = typeof params.name === 'string' ? params.name : '';
	const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
	const result = await executeFromAuthorization({
		authorization: request.headers.get('authorization'),
		action: name,
		payload: args,
		requestId: request.headers.get('x-request-id') ?? undefined,
		headers: request.headers,
	});
	if (!result.body.ok && ['unauthenticated', 'revoked_key', 'expired_key'].includes(result.body.error?.code ?? '')) {
		return rpcError(message.id, -32001, result.body.error?.message ?? 'Unauthorised.', 401, { 'WWW-Authenticate': wwwAuthenticate(request) });
	}
	return respond(rpcResult(message.id, toolResult(result.body)));
}
