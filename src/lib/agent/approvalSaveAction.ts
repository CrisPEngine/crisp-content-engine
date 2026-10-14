import 'server-only';

import { AgentError } from './errors';

/** Run save logic; return an error message for redirect, or null on success. Never call redirect here. */
export async function runApprovalSave<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
	try {
		const value = await run();
		return { ok: true, value };
	} catch (error) {
		if (error instanceof AgentError) {
			return { ok: false, message: error.message };
		}
		if (error instanceof Error) {
			return { ok: false, message: error.message };
		}
		return { ok: false, message: 'Could not save changes.' };
	}
}

export function approvalSaveRedirectQuery(outcome: { ok: true } | { ok: false; message: string }): { saved?: string; error?: string } {
	if (outcome.ok) return { saved: '1' };
	return { error: outcome.message };
}

export function appendApprovalSaveSearchParams(path: string, outcome: { ok: true } | { ok: false; message: string }): string {
	const query = approvalSaveRedirectQuery(outcome);
	const params = new URLSearchParams();
	if (query.saved) params.set('saved', query.saved);
	if (query.error) params.set('error', query.error);
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}
