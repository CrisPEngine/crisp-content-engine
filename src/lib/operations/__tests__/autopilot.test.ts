import { describe, expect, it } from 'vitest';
import { FOLIAN_PILOT_POLICY, planOperationTick } from '@/lib/operations/policy';
import { assessPublishedPage } from '@/lib/operations/discovery';
import { autopilotLabel, autopilotMayPublish, planEditorialSelection, publishingWindowOpen, weekdayInTimezone } from '@/lib/operations/autopilot';

const tuesday = new Date('2026-11-24T08:00:00.000Z');
const wednesday = new Date('2026-11-25T08:00:00.000Z');

describe('content autopilot', () => {
	it('reads Tuesday and Thursday in the publishing timezone', () => {
		expect(weekdayInTimezone(tuesday, 'Asia/Dubai')).toBe(2);
		expect(weekdayInTimezone(new Date('2026-11-26T08:00:00.000Z'), 'Asia/Dubai')).toBe(4);
		expect(publishingWindowOpen({ publishingDays: [2, 4], publishingTimezone: 'Asia/Dubai', now: tuesday })).toBe(true);
		expect(publishingWindowOpen({ publishingDays: [2, 4], publishingTimezone: 'Asia/Dubai', now: wednesday })).toBe(false);
		expect(publishingWindowOpen({})).toBe(true);
	});

	it('keeps an existing paused campaign paused and does not publish', () => {
		expect(autopilotLabel({ paused: true, mode: 'autonomous_approval', autonomousPublishingEnabled: false })).toBe('Paused');
		expect(autopilotMayPublish({ paused: true, mode: 'autonomous_publishing', autonomousPublishingEnabled: true, approved: true, policyAllows: true }).allow).toBe(false);
		expect(planOperationTick({ policy: FOLIAN_PILOT_POLICY, leaseHeld: false, opportunities: [], jobs: [] })[0]).toMatchObject({ reason: 'paused' });
	});

	it('refuses to publish without approval, outside the window, or while supervised', () => {
		const base = { paused: false, approved: true, policyAllows: true, publishingDays: [2, 4], publishingTimezone: 'Asia/Dubai', now: tuesday };
		expect(autopilotMayPublish({ ...base, mode: 'autonomous_approval', autonomousPublishingEnabled: false }).allow).toBe(false);
		expect(autopilotMayPublish({ ...base, mode: 'autonomous_publishing', autonomousPublishingEnabled: true, approved: false }).reason).toMatch(/approval/);
		expect(autopilotMayPublish({ ...base, mode: 'autonomous_publishing', autonomousPublishingEnabled: true, now: wednesday }).reason).toMatch(/publishing day/);
		expect(autopilotMayPublish({ ...base, mode: 'autonomous_publishing', autonomousPublishingEnabled: true }).allow).toBe(true);
	});

	it('uses approved opportunities and does not fill a quota with weak topics', () => {
		const plan = planEditorialSelection({
			target: 2,
			minimumScore: 0.7,
			takenTopicKeys: ['choose a book idea'],
			candidates: [
				{ id: 'approved', score: 0.9, approved: true, topicKey: 'scene test', overlapping: false },
				{ id: 'duplicate', score: 0.95, approved: true, topicKey: 'choose a book idea', overlapping: false },
				{ id: 'weak', score: 0.2, approved: true, topicKey: 'filler', overlapping: false },
				{ id: 'idea', score: 0.99, approved: false, topicKey: 'new idea', overlapping: false },
			],
		});
		expect(plan.selected).toEqual(['approved']);
		expect(plan.unfilledReason).toMatch(/quality threshold/);
		expect(plan.skipped.map((item) => item.id)).toEqual(['duplicate', 'weak', 'idea']);
	});

	it('does not treat a sitemap listing as confirmed indexing', () => {
		const result = assessPublishedPage({
			httpStatus: 200,
			finalUrl: 'https://folian.app/articles/example',
			expectedCanonical: 'https://folian.app/articles/example',
			canonical: 'https://folian.app/articles/example',
			robotsMeta: null,
			xRobotsTag: null,
			robotsTxtAllows: true,
			inSitemap: true,
			sitemapLastmod: '2026-11-26',
			searchConsoleCoverage: 'unknown',
		});
		expect(result.publication).toBe('published');
		expect(result.discovery).toBe('discoverable');
		expect(result.indexing).toBe('not_confirmed');
	});

	it('confirms indexing only from a Search Console indexed verdict', () => {
		const blocked = assessPublishedPage({
			httpStatus: 200,
			finalUrl: 'https://folian.app/articles/example',
			expectedCanonical: 'https://folian.app/articles/example',
			canonical: 'https://folian.app/articles/other',
			robotsMeta: 'noindex',
			xRobotsTag: null,
			robotsTxtAllows: false,
			inSitemap: false,
			sitemapLastmod: null,
			searchConsoleCoverage: 'not_indexed',
		});
		expect(blocked.discovery).toBe('blocked');
		expect(blocked.indexing).toBe('not_confirmed');
		const indexed = assessPublishedPage({
			httpStatus: 200,
			finalUrl: 'https://folian.app/articles/example',
			expectedCanonical: 'https://folian.app/articles/example',
			canonical: 'https://folian.app/articles/example',
			robotsMeta: null,
			xRobotsTag: null,
			robotsTxtAllows: true,
			inSitemap: true,
			sitemapLastmod: '2026-11-26',
			searchConsoleCoverage: 'submitted_and_indexed',
		});
		expect(indexed.indexing).toBe('indexed');
	});
});
