export type FailureClass = 'transient' | 'terminal';

const TRANSIENT = /network|fetch failed|timed out|timeout|rate limit|too many requests|429|502|503|504|econnreset|eai_again|temporarily unavailable|provider error/i;
const TERMINAL = /product claim|unsupported capability|factual|could not verify|verification failed|budget|authentication|unauthorized|forbidden|401|403|credential|critical finding|correction limit|already live|already published|cms_published/i;

export function classifyProductionFailure(message: string): { failureClass: FailureClass; recoverable: boolean; reason: string } {
	if (TERMINAL.test(message)) return { failureClass: 'terminal', recoverable: false, reason: message };
	if (TRANSIENT.test(message)) return { failureClass: 'transient', recoverable: true, reason: message };
	return { failureClass: 'terminal', recoverable: false, reason: message };
}

export function nextRetryAt(attempt: number, now: number): string | null {
	if (attempt >= 3) return null;
	const delay = Math.min(10 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt));
	return new Date(now + delay).toISOString();
}

export type RecoveryState = { count: number; after: string | null; failureClass: FailureClass | null; reason: string };

export function readRecovery(notes: Array<{ note: string }>): RecoveryState {
	const entry = [...notes].reverse().find((item) => item.note.startsWith('recovery:'));
	if (!entry) return { count: 0, after: null, failureClass: null, reason: '' };
	try {
		const parsed = JSON.parse(entry.note.slice('recovery:'.length)) as Partial<RecoveryState>;
		return {
			count: typeof parsed.count === 'number' ? parsed.count : 0,
			after: typeof parsed.after === 'string' ? parsed.after : null,
			failureClass: parsed.failureClass === 'transient' || parsed.failureClass === 'terminal' ? parsed.failureClass : null,
			reason: typeof parsed.reason === 'string' ? parsed.reason : '',
		};
	} catch {
		return { count: 0, after: null, failureClass: null, reason: '' };
	}
}

export function recoveryNote(state: RecoveryState): string {
	return `recovery:${JSON.stringify(state)}`;
}
