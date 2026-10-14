import { DateTime } from 'luxon';

export const APPROVAL_SCHEDULE_TIMEZONE = 'Asia/Dubai';

/** Format UTC ISO for `<input type="datetime-local">` interpreted as GST. */
export function utcIsoToGstDatetimeLocalValue(iso: string | null | undefined): string {
	if (!iso) return '';
	const dt = DateTime.fromISO(iso, { zone: 'utc' });
	if (!dt.isValid) return '';
	return dt.setZone(APPROVAL_SCHEDULE_TIMEZONE).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Parse datetime-local value as GST and return UTC ISO. */
export function gstDatetimeLocalValueToUtcIso(local: string): string {
	const dt = DateTime.fromFormat(local.trim(), "yyyy-MM-dd'T'HH:mm", { zone: APPROVAL_SCHEDULE_TIMEZONE });
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
	const dt = DateTime.fromISO(iso, { zone: 'utc' });
	if (!dt.isValid) return String(iso);
	return dt.setZone(APPROVAL_SCHEDULE_TIMEZONE).toFormat("d LLL yyyy, HH:mm 'GST'");
}
