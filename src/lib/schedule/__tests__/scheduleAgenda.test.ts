import { describe, expect, it } from 'vitest';
import { formatAgendaItemTime, groupScheduleItemsByDay } from '@/lib/schedule/scheduleAgenda';
import type { ScheduleCalendarItem } from '@/lib/schedule/schedulePresentation';

function item(partial: Partial<ScheduleCalendarItem> & Pick<ScheduleCalendarItem, 'id' | 'scheduled_date'>): ScheduleCalendarItem {
	return {
		title: 'Title',
		platform: 'LinkedIn',
		status: 'Scheduled',
		brand_name: 'Brand',
		content_preview: 'Preview',
		...partial,
	};
}

describe('groupScheduleItemsByDay', () => {
	it('groups and sorts items by day and time in GST', () => {
		const grouped = groupScheduleItemsByDay([
			item({ id: 'b', scheduled_date: '2026-11-03T14:00:00.000Z' }),
			item({ id: 'a', scheduled_date: '2026-11-03T08:00:00.000Z' }),
			item({ id: 'c', scheduled_date: '2026-11-04T08:00:00.000Z' }),
		]);
		expect(grouped).toHaveLength(2);
		expect(grouped[0].items.map((row) => row.id)).toEqual(['a', 'b']);
		expect(grouped[1].items.map((row) => row.id)).toEqual(['c']);
	});
});

describe('formatAgendaItemTime', () => {
	it('formats wall time in GST', () => {
		const label = formatAgendaItemTime('2026-11-03T08:00:00.000Z');
		expect(label).toMatch(/12:00 PM|12:00 pm/i);
	});
});
