const SENSITIVE_KEY_PATTERN = /authorization|api[-_]?key|secret|token|password|cookie|bearer/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactString(value: string): string {
	return value.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

export function redactValue(value: unknown, depth = 0): unknown {
	if (depth > 5) return '[REDACTED_DEPTH]';
	if (value === null || value === undefined) return value;
	if (typeof value === 'string') return redactString(value);
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value)) {
		return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
	}
	if (typeof value !== 'object') return '[REDACTED_VALUE]';

	const output: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		if (SENSITIVE_KEY_PATTERN.test(key)) {
			output[key] = '[REDACTED]';
			continue;
		}
		output[key] = redactValue(nested, depth + 1);
	}
	return output;
}
