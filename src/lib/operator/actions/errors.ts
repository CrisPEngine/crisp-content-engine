export class OperatorActionError extends Error {
	readonly status: number;
	readonly code: string;
	readonly details?: unknown;

	constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
		super(message);
		this.name = 'OperatorActionError';
		this.status = options.status ?? 500;
		this.code = options.code ?? 'operator_action_error';
		this.details = options.details;
	}
}

export function toOperatorActionError(error: unknown): OperatorActionError {
	if (error instanceof OperatorActionError) return error;
	if (error instanceof Error) {
		return new OperatorActionError(error.message, { details: { name: error.name } });
	}
	return new OperatorActionError('Unknown operator action error', { details: error });
}
