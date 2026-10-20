import { describe, expect, it } from 'vitest';
import { schedulePublishWarning } from '@/lib/publish/schedulePublishWarning';

describe('schedulePublishWarning', () => {
	it('warns when overdue content has no publish job', () => {
		const message = schedulePublishWarning(
			{
				channel: 'instagram',
				publicationStatus: 'scheduled',
				publicationDate: '2020-01-01T00:00:00.000Z',
			},
			undefined,
		);
		expect(message).toMatch(/no publish job/i);
	});

	it('returns null for published channels without native cron', () => {
		expect(
			schedulePublishWarning(
				{ channel: 'linkedin', publicationStatus: 'scheduled', publicationDate: '2020-01-01T00:00:00.000Z' },
				undefined,
			),
		).toBeNull();
	});
});
