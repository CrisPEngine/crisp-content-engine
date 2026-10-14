import { describe, expect, it } from 'vitest';
import {
	assertGstDatetimeLocalFieldValue,
	formatPublishAtForDisplay,
	gstDatetimeLocalValueToUtcIso,
	parseUtcPublishAtIso,
	utcIsoToGstDatetimeLocalValue,
} from './gstSchedule';

describe('gstSchedule', () => {
	it('converts 2026-10-14T13:30:00Z to 17:30 GST for datetime-local', () => {
		expect(utcIsoToGstDatetimeLocalValue('2026-10-14T13:30:00Z')).toBe('2026-10-14T17:30');
	});

	it('treats offset-less publishAt as UTC', () => {
		expect(utcIsoToGstDatetimeLocalValue('2026-10-14T13:30:00')).toBe('2026-10-14T17:30');
	});

	it('round-trips GST datetime-local to UTC', () => {
		const utc = gstDatetimeLocalValueToUtcIso('2026-10-14T17:30');
		expect(utc).toBe('2026-10-14T13:30:00.000Z');
		expect(utcIsoToGstDatetimeLocalValue(utc)).toBe('2026-10-14T17:30');
	});

	it('formats display in GST regardless of process timezone', () => {
		expect(formatPublishAtForDisplay('2026-10-14T13:30:00Z')).toBe('14 Oct 2026, 17:30 GST');
	});

	it('normalizes ISO-with-Z values mistakenly passed to datetime-local', () => {
		expect(assertGstDatetimeLocalFieldValue('2026-10-14T13:30:00Z')).toBe('2026-10-14T17:30');
	});

	it('parseUtcPublishAtIso is stable for Z and offset-less inputs', () => {
		const withZ = parseUtcPublishAtIso('2026-10-14T13:30:00Z');
		const noZ = parseUtcPublishAtIso('2026-10-14T13:30:00');
		expect(withZ.toMillis()).toBe(noZ.toMillis());
	});
});
