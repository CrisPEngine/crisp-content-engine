import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
	const origin = new URL(request.url).origin;
	const clientId = new URL('/oauth/clients/generic', origin).toString();
	return NextResponse.json({
		client_id: clientId,
		client_name: 'Generic MCP client',
		redirect_uris: ['http://localhost:6274/oauth/callback', 'http://127.0.0.1:6274/oauth/callback'],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none',
	});
}
