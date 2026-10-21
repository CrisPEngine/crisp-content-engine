import 'server-only';

/** Parse user or DB timestamps as a UTC instant (handles `Z`, offsets, and missing seconds). */
export function parsePublishInstant(value: string | undefined): Date | null {
	if (!value?.trim()) return null;
	const parsed = new Date(value.trim());
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
}

export function publishInstantMs(value: string | undefined): number | null {
	const parsed = parsePublishInstant(value);
	return parsed ? parsed.getTime() : null;
}

/** Canonical ISO for persistence and worker queries. */
export function toPublishInstantIso(value: string | undefined): string | null {
	const parsed = parsePublishInstant(value);
	return parsed ? parsed.toISOString() : null;
}

export function publishInstantsMatch(
	a: string | undefined,
	b: string | undefined,
	toleranceMs = 2_000,
): boolean {
	if (!a?.trim() || !b?.trim()) return !a?.trim() && !b?.trim();
	const ams = publishInstantMs(a);
	const bms = publishInstantMs(b);
	if (ams == null || bms == null) return false;
	return Math.abs(ams - bms) <= toleranceMs;
}
