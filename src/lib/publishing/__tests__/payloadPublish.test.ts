import { describe, expect, it } from 'vitest';
import { interpretPublishResponse, livePageMatches, publishDecision, usefulnessBlockers } from '@/lib/publishing/payloadPublish';

describe('payload publication', () => {
	it('does not publish an approved article unless publication is explicit and enabled', () => {
		expect(publishDecision({ approved: true, blockers: [], liveEnabled: true, explicit: false, autoPublish: false })).toMatchObject({ allow: false });
		expect(publishDecision({ approved: true, blockers: [], liveEnabled: true, explicit: true, autoPublish: true })).toMatchObject({ allow: false });
		expect(publishDecision({ approved: false, blockers: [], liveEnabled: true, explicit: true, autoPublish: false }).allow).toBe(false);
		expect(publishDecision({ approved: true, blockers: ['intro-weak'], liveEnabled: true, explicit: true, autoPublish: false }).allow).toBe(false);
		expect(publishDecision({ approved: true, blockers: [], liveEnabled: false, explicit: true, autoPublish: false })).toMatchObject({ allow: false, phase: 'approved' });
	});

	it('treats a stale Payload revision as a failed write and a repeat key as the existing result', () => {
		const stale = interpretPublishResponse(409, { ok: false, code: 'stale_revision', currentRevision: 4 });
		expect(stale.phase).toBe('failed');
		expect(stale.published).toBe(false);
		const duplicate = interpretPublishResponse(200, { ok: true, duplicate: true, published: true, publication: { canonicalUrl: 'https://folian.app/articles/example', revision: 4, live: true } });
		expect(duplicate.duplicate).toBe(true);
		expect(duplicate.phase).toBe('published');
	});

	it('blocks publication while a weak introduction is still open', () => {
		expect(usefulnessBlockers([
			{ id: 'intro-weak', status: 'open', severity: 'major', category: 'structure' },
			{ id: 'example-conflict', status: 'resolved', severity: 'critical', category: 'examples' },
		])).toEqual(['intro-weak']);
	});

	it('checks the live title without treating a different description as a match', () => {
		const html = '<title>How to Organize Timelines in Fiction | Folian</title><meta name="description" content="Original."/>';
		expect(livePageMatches(html, { title: 'How to Organize Timelines in Fiction', description: 'Original.' }).ok).toBe(true);
		expect(livePageMatches(html, { title: 'How to Organize Timelines in Fiction', description: 'Changed.' }).problems).toContain('description');
	});
});
