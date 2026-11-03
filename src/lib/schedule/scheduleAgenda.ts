import { DateTime } from 'luxon';
import { APPROVAL_SCHEDULE_TIMEZONE, parseUtcPublishAtIso } from '@/lib/datetime/gstSchedule';
import type { ScheduleCalendarItem } from '@/lib/schedule/schedulePresentation';

export type ScheduleAgendaDay = {
	dayKey: string;
	label: string;
	items: ScheduleCalendarItem[];
};

export function groupScheduleItemsByDay(items: ScheduleCalendarItem[]): ScheduleAgendaDay[] {
	const withDates = items.filter((item) => item.scheduled_date);
	const byDay = new Map<string, ScheduleCalendarItem[]>();

	for (const item of withDates) {
		const dt = parseUtcPublishAtIso(item.scheduled_date).setZone(APPROVAL_SCHEDULE_TIMEZONE);
		if (!dt.isValid) continue;
		const dayKey = dt.toFormat('yyyy-MM-dd');
		const bucket = byDay.get(dayKey) ?? [];
		bucket.push(item);
		byDay.set(dayKey, bucket);
	}

	return [...byDay.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([dayKey, dayItems]) => {
			const labelDt = DateTime.fromFormat(dayKey, 'yyyy-MM-dd', { zone: APPROVAL_SCHEDULE_TIMEZONE });
			const label = labelDt.isValid
				? labelDt.toFormat('ccc, d LLL yyyy')
				: dayKey;
			const sorted = [...dayItems].sort((a, b) => {
				const aMs = parseUtcPublishAtIso(a.scheduled_date).toMillis();
				const bMs = parseUtcPublishAtIso(b.scheduled_date).toMillis();
				return aMs - bMs;
			});
			return { dayKey, label, items: sorted };
		});
}

export function formatAgendaItemTime(scheduledDate: string): string {
	const dt = parseUtcPublishAtIso(scheduledDate).setZone(APPROVAL_SCHEDULE_TIMEZONE);
	if (!dt.isValid) return '';
	return dt.toFormat('h:mm a');
}
