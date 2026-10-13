import 'server-only';

import { getRoleConfig, type ModelRole } from './roles';

/** Role used for long-form social posts and article section drafting. */
export const LONG_FORM_MODEL_ROLE = 'LONG_FORM_WRITING' as ModelRole;

export function resolveLongFormMaxTokens(): number {
	const raw = process.env.AI_LONG_FORM_MAX_TOKENS?.trim();
	if (raw) {
		const n = parseInt(raw, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return getRoleConfig(LONG_FORM_MODEL_ROLE).maxTokens;
}

export function resolveLongFormTimeoutMs(): number {
	const raw = process.env.AI_LONG_FORM_TIMEOUT_MS?.trim();
	if (raw) {
		const n = parseInt(raw, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return getRoleConfig(LONG_FORM_MODEL_ROLE).timeoutMs;
}

export function resolveArticleGenerationWorkerSecret(): string | null {
	const secret = process.env.AGENT_ARTICLE_GENERATION_SECRET?.trim();
	return secret || null;
}

export function articleGenerationRunsInline(): boolean {
	if (process.env.AGENT_ARTICLE_GENERATION_INLINE === 'true') return true;
	if (process.env.NODE_ENV === 'test') return true;
	return false;
}
