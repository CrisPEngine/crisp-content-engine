import { describe, expect, it } from 'vitest';
import { duePublicationAction, interpretPublishResponse, livePageMatches, publicationQualityGate, publishDecision, runGuardedPublish, usefulnessBlockers } from '@/lib/publishing/payloadPublish';

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

	it('reads the current revision and does not overwrite a newer Payload document', async () => {
		const { runGuardedPublish } = await import('@/lib/publishing/payloadPublish');
		let published = false;
		const result = await runGuardedPublish({
			approved: true,
			researchApproved: true,
			criticalOpen: 0,
			materialOpen: [],
			seoReady: true,
			heroRequired: true,
			heroReady: true,
			editorialChecked: true,
			externalId: 'catalog:timeline',
			expectedRevision: 2,
			explicit: true,
			liveEnabled: true,
			autoPublish: false,
			title: 'How to Organize Timelines in Fiction',
			description: 'A practical timeline.',
			client: {
				read: async () => ({ status: 200, body: { publication: { revision: 3, title: 'Edited in Payload', dek: 'A practical timeline.' } } }),
				publish: async () => {
					published = true;
					return { status: 200, body: { ok: true, published: true } };
				},
			},
		});
		expect(published).toBe(false);
		expect(result.sent).toBe(false);
		expect(result.phase).toBe('failed');
		expect(result.retryPublication).toBe(false);
	});

	it('does not publish again when the public page is still stale', async () => {
		const { runGuardedPublish } = await import('@/lib/publishing/payloadPublish');
		let calls = 0;
		const result = await runGuardedPublish({
			approved: true,
			researchApproved: true,
			criticalOpen: 0,
			materialOpen: [],
			seoReady: true,
			heroRequired: false,
			heroReady: false,
			editorialChecked: true,
			externalId: 'catalog:timeline',
			expectedRevision: 2,
			explicit: true,
			liveEnabled: true,
			autoPublish: false,
			title: 'How to Organize Timelines in Fiction',
			description: 'A practical timeline.',
			client: {
				read: async () => ({ status: 200, body: { publication: { revision: 2, title: 'How to Organize Timelines in Fiction', dek: 'A practical timeline.' } } }),
				publish: async () => {
					calls += 1;
					return { status: 200, body: { ok: true, published: true, publication: { revision: 2, live: true, canonicalUrl: 'https://folian.app/articles/example' } } };
				},
				page: async () => '<title>Old title</title><meta name="description" content="Old."/>',
			},
		});
		expect(calls).toBe(1);
		expect(result.phase).toBe('published');
		expect(result.retryPublication).toBe(false);
	});

	it('stops on an idempotency conflict, an authentication failure, and a dropped request', async () => {
		const ready = {
			approved: true,
			researchApproved: true,
			criticalOpen: 0,
			materialOpen: [],
			seoReady: true,
			heroRequired: false,
			heroReady: false,
			editorialChecked: true,
			externalId: 'catalog:timeline',
			expectedRevision: 2,
			explicit: true,
			liveEnabled: true,
			autoPublish: false,
			title: 'How to Organize Timelines in Fiction',
			description: 'A practical timeline.',
		};
		let calls = 0;
		const conflict = await runGuardedPublish({
			...ready,
			client: {
				read: async () => ({ status: 200, body: { publication: { revision: 2 } } }),
				publish: async () => {
					calls += 1;
					return { status: 409, body: { ok: false, code: 'idempotency_conflict' } };
				},
			},
		});
		expect(conflict.sent).toBe(false);
		expect(calls).toBe(1);
		const unauthorised = await runGuardedPublish({
			...ready,
			client: {
				read: async () => ({ status: 401, body: { code: 'unauthorized' } }),
				publish: async () => {
					calls += 1;
					return { status: 200, body: { ok: true, published: true } };
				},
			},
		});
		expect(unauthorised.sent).toBe(false);
		expect(calls).toBe(1);
		const dropped = await runGuardedPublish({
			...ready,
			client: {
				read: async () => ({ status: 200, body: { publication: { revision: 2 } } }),
				publish: async () => {
					throw new Error('network');
				},
			},
		});
		expect(dropped.sent).toBe(false);
		expect(dropped.retryPublication).toBe(false);
	});

	it('refuses publication when research, editorial, SEO, hero, or revision checks fail', () => {
		const ready = {
			approved: true,
			researchApproved: true,
			criticalOpen: 0,
			materialOpen: [],
			seoReady: true,
			heroRequired: true,
			heroReady: true,
			editorialChecked: true,
			externalId: 'catalog:timeline',
			expectedRevision: 2,
			currentRevision: 2,
		};
		expect(publicationQualityGate({ ...ready, researchApproved: false }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, editorialChecked: false }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, criticalOpen: 1 }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, materialOpen: ['cta-weak'] }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, seoReady: false }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, heroReady: false }).ok).toBe(false);
		expect(publicationQualityGate({ ...ready, currentRevision: 3 }).ok).toBe(false);
		expect(publicationQualityGate(ready).ok).toBe(true);
	});

	it('publishes only an armed schedule while live publishing is enabled', () => {
		expect(duePublicationAction({ scheduleStatus: 'scheduled', approval: 'approved', publicationState: 'scheduled', liveEnabled: false, error: null })).toBe('hold');
		expect(duePublicationAction({ scheduleStatus: 'scheduled', approval: 'pending', publicationState: 'scheduled', liveEnabled: true, error: null })).toBe('hold');
		expect(duePublicationAction({ scheduleStatus: 'scheduled', approval: 'approved', publicationState: 'scheduled', liveEnabled: true, error: null })).toBe('publish');
		expect(duePublicationAction({ scheduleStatus: 'due', approval: 'approved', publicationState: 'published', liveEnabled: true, error: null })).toBe('ignore');
		expect(duePublicationAction({ scheduleStatus: 'due', approval: 'approved', publicationState: 'failed', liveEnabled: true, error: 'Payload has a newer revision.' })).toBe('hold');
		expect(duePublicationAction({ scheduleStatus: 'due', approval: 'approved', publicationState: 'failed', liveEnabled: true, error: 'The publish request failed before Payload responded. It was not retried.' })).toBe('publish');
	});

	it('checks the live title without treating a different description as a match', () => {
		const html = '<title>How to Organize Timelines in Fiction | Folian</title><meta name="description" content="Original."/>';
		expect(livePageMatches(html, { title: 'How to Organize Timelines in Fiction', description: 'Original.' }).ok).toBe(true);
		expect(livePageMatches(html, { title: 'How to Organize Timelines in Fiction', description: 'Changed.' }).problems).toContain('description');
	});
});
