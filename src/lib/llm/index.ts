import 'server-only';

import { openaiProvider } from './providers/openai';
import type { LlmAuthContext, LlmProvider, LlmProviderId, StructuredJsonRequest, StructuredJsonResult } from './types';
import { LlmError } from './types';

const providers: Record<LlmProviderId, LlmProvider | undefined> = {
	openai: openaiProvider,
	anthropic: undefined,
	gemini: undefined,
};

export function resolveLlmProviderId(): LlmProviderId {
	const configured = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
	if (configured === 'openai' || configured === 'anthropic' || configured === 'gemini') {
		return configured;
	}
	return 'openai';
}

export function resolveSidecarLlmModel(): string {
	return (
		process.env.SIDECAR_LLM_MODEL ||
		process.env.SIDECAR_OPENAI_MODEL ||
		'gpt-4o-mini'
	);
}

/**
 * Resolves server-side credentials for the configured provider.
 * Future: branch on auth.userId / workspaceId for BYO keys.
 */
export function resolveLlmAuthContext(overrides?: Partial<LlmAuthContext>): LlmAuthContext {
	const provider = overrides?.provider ?? resolveLlmProviderId();

	if (provider === 'openai') {
		const apiKey = overrides?.apiKey ?? process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new LlmError('OPENAI_API_KEY is not configured', {
				code: 'llm_missing_api_key',
				provider: 'openai',
			});
		}
		return {
			provider: 'openai',
			apiKey,
			userId: overrides?.userId,
			workspaceId: overrides?.workspaceId,
		};
	}

	throw new LlmError(`LLM provider "${provider}" is not implemented`, {
		code: 'llm_provider_not_implemented',
		provider,
	});
}

export function getLlmProvider(providerId: LlmProviderId = resolveLlmProviderId()): LlmProvider {
	const provider = providers[providerId];
	if (!provider) {
		throw new LlmError(`LLM provider "${providerId}" is not implemented`, {
			code: 'llm_provider_not_implemented',
			provider: providerId,
		});
	}
	return provider;
}

export async function completeStructuredJson<T>(
	request: StructuredJsonRequest,
	options?: { auth?: Partial<LlmAuthContext> },
): Promise<StructuredJsonResult<T>> {
	const auth = resolveLlmAuthContext(options?.auth);
	const provider = getLlmProvider(auth.provider);
	return provider.completeStructuredJson<T>(request, auth);
}

export { LlmError };
export type {
	LlmAuthContext,
	LlmMessage,
	LlmProvider,
	LlmProviderId,
	StructuredJsonRequest,
	StructuredJsonResult,
} from './types';
