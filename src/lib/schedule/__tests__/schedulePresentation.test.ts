import { describe, expect, it } from 'vitest';
import {
	canEditScheduleItemText,
	canRescheduleScheduleItem,
	canUnscheduleScheduleItem,
} from '@/lib/schedule/schedulePresentation';

describe('schedule item actions', () => {
	it('allows reschedule except published', () => {
		expect(canRescheduleScheduleItem('Scheduled')).toBe(true);
		expect(canRescheduleScheduleItem('Published')).toBe(false);
	});

	it('allows unschedule for active queue states', () => {
		expect(canUnscheduleScheduleItem('Scheduled')).toBe(true);
		expect(canUnscheduleScheduleItem('Published')).toBe(false);
	});

	it('blocks text edits for published and publishing', () => {
		expect(canEditScheduleItemText('Scheduled')).toBe(true);
		expect(canEditScheduleItemText('Publishing')).toBe(false);
		expect(canEditScheduleItemText('Published')).toBe(false);
	});
});
