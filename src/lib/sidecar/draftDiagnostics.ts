import 'server-only';

import { redactValue } from './redaction';

export type SidecarDraftLogMeta = Record<string, unknown>;

export function logSidecarDraftStep(step: string, meta?: SidecarDraftLogMeta): void {
	if (process.env.NODE_ENV === 'production') return;
	console.log(`[Sidecar draft] ${step}`, redactValue(meta ?? {}));
}

export function logSidecarDraftFailure(step: string, error: unknown, meta?: SidecarDraftLogMeta): void {
	const base =
		error instanceof Error
			? { message: error.message, name: error.name }
			: { message: String(error) };
	console.error(`[Sidecar draft] ${step} failed`, redactValue({ ...meta, ...base }));
}
