import { DateTime } from 'luxon';

export const APPROVAL_SCHEDULE_TIMEZONE = 'Asia/Dubai';

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * Parse a stored publishAt as a UTC instant.
 * Offset-less strings are treated as UTC (not the server or browser local zone).
 */
export function parseUtcPublishAtIso(iso: string): DateTime {
	const trimmed = iso.trim();
	if (!trimmed) return DateTime.invalid('empty');
	if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
		const parsed = DateTime.fromISO(trimmed, { setZone: true });
		return parsed.isValid ? parsed.toUTC() : DateTime.invalid('invalid');
	}
	return DateTime.fromISO(trimmed, { zone: 'utc' });
}

/** Format UTC ISO for `<input type="datetime-local">` wall time in GST (no offset suffix). */
export function utcIsoToGstDatetimeLocalValue(iso: string | null | undefined): string {
	if (!iso) return '';
	const dt = parseUtcPublishAtIso(iso);
	if (!dt.isValid) return '';
	return dt.setZone(APPROVAL_SCHEDULE_TIMEZONE).toFormat(DATETIME_LOCAL_FORMAT);
}

/** Parse datetime-local value as GST wall time and return UTC ISO. */
export function gstDatetimeLocalValueToUtcIso(local: string): string {
	const dt = DateTime.fromFormat(local.trim(), DATETIME_LOCAL_FORMAT, { zone: APPROVAL_SCHEDULE_TIMEZONE });
	if (!dt.isValid) {
		throw new Error('Invalid schedule time.');
	}
	const utc = dt.toUTC();
	const iso = utc.toISO();
	if (!iso) throw new Error('Invalid schedule time.');
	return iso;
}

export function formatPublishAtForDisplay(iso: string | null | undefined): string {
	if (!iso) return '';
	const dt = parseUtcPublishAtIso(iso);
	if (!dt.isValid) return String(iso);
	return dt.setZone(APPROVAL_SCHEDULE_TIMEZONE).toFormat("d LLL yyyy, HH:mm 'GST'");
}

/** Avoid passing ISO strings with Z into datetime-local (browsers show local time). */
export function assertGstDatetimeLocalFieldValue(value: string): string {
	if (!value) return value;
	if (/[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) {
		return utcIsoToGstDatetimeLocalValue(value);
	}
	return value;
}
