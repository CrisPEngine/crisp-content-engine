import 'server-only';

import { DateTime } from 'luxon';
import type { GeneratedItemInput } from '../types';

const DEFAULT_LINKEDIN_HOUR = 9;
const DEFAULT_META_HOUR = 10;
const DEFAULT_X_HOUR = 12;
const DEFAULT_BLOG_HOUR = 8;

function hourFromPostingWindows(postingWindows: unknown, defaultHour: number): number {
	if (typeof postingWindows === 'string' && /^\d{1,2}/.test(postingWindows.trim())) {
		const n = parseInt(postingWindows.trim(), 10);
		if (n >= 0 && n <= 23) return n;
	}
	if (Array.isArray(postingWindows) && postingWindows.length > 0) {
		const first = postingWindows[0];
		if (typeof first === 'string' && /^\d{1,2}/.test(first.trim())) {
			const n = parseInt(first.trim(), 10);
			if (n >= 0 && n <= 23) return n;
		}
		if (typeof first === 'object' && first !== null && 'hour' in first) {
			const h = (first as { hour?: number }).hour;
			if (typeof h === 'number' && h >= 0 && h <= 23) return h;
		}
	}
	return defaultHour;
}

function defaultHourForChannel(channel: string, postingWindows: unknown): number {
	const ch = channel.toLowerCase();
	if (ch === 'linkedin') return hourFromPostingWindows(postingWindows, DEFAULT_LINKEDIN_HOUR);
	if (ch === 'instagram' || ch === 'facebook') {
		return hourFromPostingWindows(postingWindows, DEFAULT_META_HOUR);
	}
	if (ch === 'x') return hourFromPostingWindows(postingWindows, DEFAULT_X_HOUR);
	if (ch === 'blog') return hourFromPostingWindows(postingWindows, DEFAULT_BLOG_HOUR);
	return DEFAULT_LINKEDIN_HOUR;
}

function dayOffsetForChannel(channel: string, position: number): number {
	const ch = channel.toLowerCase();
	if (ch === 'linkedin') return (position - 1) * 2;
	if (ch === 'instagram' || ch === 'facebook') return (position - 1) * 3;
	if (ch === 'x') return position - 1;
	if (ch === 'blog') return (position - 1) * 7;
	return position - 1;
}

/**
 * Assign future unique scheduled_time values per item before persistence.
 */
export function computeItemSchedules(
	items: GeneratedItemInput[],
	opts: { timezone: string; postingWindows: unknown },
): GeneratedItemInput[] {
	const tz = opts.timezone?.trim() || 'UTC';
	const nowInTz = DateTime.now().setZone(tz);
	const usedTimes = new Set<string>();

	return items.map((item) => {
		if (item.scheduled_time) {
			const dt = DateTime.fromISO(item.scheduled_time, { zone: tz });
			if (dt.isValid && dt > nowInTz) {
				usedTimes.add(item.scheduled_time);
				return item;
			}
		}

		const hour = defaultHourForChannel(item.channel, opts.postingWindows);
		const position = item.series_position ?? 1;
		const daysOut = Math.max(1, dayOffsetForChannel(item.channel, position));
		let candidate = nowInTz.plus({ days: daysOut }).set({
			hour,
			minute: 0,
			second: 0,
			millisecond: 0,
		});

		while (usedTimes.has(candidate.toISO()!) || candidate <= nowInTz) {
			candidate = candidate.plus({ hours: 1 });
		}

		const iso = candidate.toISO()!;
		usedTimes.add(iso);
		return { ...item, scheduled_time: iso };
	});
}
