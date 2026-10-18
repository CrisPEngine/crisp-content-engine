/** Coerce form / JSON values into booleans (handles legacy string drafts). */
export function coerceBoolean(val: unknown, defaultValue = true): boolean {
	if (typeof val === 'boolean') return val;
	if (val === null || val === undefined || val === '') return defaultValue;
	if (typeof val === 'string') {
		const normalized = val.trim().toLowerCase();
		if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
		if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
	}
	if (typeof val === 'number') {
		if (val === 1) return true;
		if (val === 0) return false;
	}
	return defaultValue;
}
