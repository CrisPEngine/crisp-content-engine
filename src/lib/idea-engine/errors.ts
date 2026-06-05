import 'server-only';

export class IdeaEngineError extends Error {
	readonly status: number;
	readonly code: string;
	readonly details?: unknown;

	constructor(
		message: string,
		options: { status: number; code: string; details?: unknown },
	) {
		super(message);
		this.name = 'IdeaEngineError';
		this.status = options.status;
		this.code = options.code;
		this.details = options.details;
	}
}

export function userFacingMessage(code: string, fallback: string): string {
	const map: Record<string, string> = {
		idea_engine_missing_openai_key: 'Content generation is not configured. Please contact support.',
		idea_engine_prompt_build_failed: 'Could not prepare your series. Please try again.',
		idea_engine_generation_failed: 'Generation failed. Please try again.',
		idea_engine_schema_validation_failed: 'Generated content did not pass validation. Please try again.',
		idea_engine_run_not_found: 'Series run not found.',
		idea_engine_run_cancelled: 'This series was cancelled.',
	};
	return map[code] ?? fallback;
}
