import { describe, expect, it } from 'vitest';
import { approveMetadataProposalRecord, storeMetadataProposal } from '@/lib/articles/metadataProposal';
import { commitRevision, contentHash, ensureRevision } from '@/lib/articles/revisions';
import type { ArticleRecord } from '@/lib/articles/types';
import { countsAsArticleStart, productionCapacity, workTypeForOpportunity } from '@/lib/campaigns/productionPolicy';
import { metadataApplyDecision } from '@/lib/publishing/payloadCatalogue';
import { buildContentOverview, isQaRecord } from '@/lib/content/overview';
import { APP_NAV } from '@/lib/nav';

function article(body: string): ArticleRecord {
	const hash = contentHash(body);
	return {
		id: 'article-1',
		ownerUserId: 'user-a',
		brandId: 'brand-a',
		title: 'ChatGPT for Novel Writing',
		topic: 'chatgpt for novel writing',
		body,
		wordCount: 4,
		status: 'review',
		approval: { required: true, approver: 'human', status: 'pending' },
		seo: { title: 'ChatGPT for Novel Writing', seoTitle: 'ChatGPT for Novel Writing | Folian', slug: 'chatgpt-for-novel-writing', excerpt: '', metaDescription: 'The published description.', canonical: null, primaryKeyword: null, secondaryTopics: [] },
		versions: [],
		sections: [],
		workspace: {
			revision: { id: 'rev-1', number: 1, contentHash: hash, wordCount: 4, createdAt: '2026-11-17T00:00:00.000Z', source: 'baseline', kind: 'baseline', note: 'Published baseline' },
			cms: { externalId: 'catalog:chatgpt-for-novel-writing', revision: 2, draftUrl: null, lastSyncAt: null, lastError: null, mode: null, baselineRevision: 2 },
			brief: { secondaryKeywords: '', questions: '', avoid: '', tone: '', cta: '', requiredLinks: '', referenceMaterial: '', instructions: '' },
		},
		library: { archivedAt: null, canonicalUrl: 'https://folian.app/articles/chatgpt-for-novel-writing', stageNote: null, cms: { payloadId: '12', revision: 2, title: 'ChatGPT for Novel Writing', description: 'The published description.', slug: 'chatgpt-for-novel-writing', externalId: 'catalog:chatgpt-for-novel-writing', status: 'published', publishedAt: null, updatedAt: '2026-10-28T19:01:04.346Z', hero: null, contentRef: 'payload:12', syncedAt: '2026-11-17T18:24:47.747Z' } },
	} as ArticleRecord;
}

describe('revision integrity and metadata optimisation', () => {
	it('archives a contaminated draft and stores the article without its metadata block', () => {
		const leaked = '---\ntitle: "ChatGPT for Novel Writing: Uses & Limits | Folian"\nmeta_description: "Use ChatGPT for ideas."\nstatus: draft\nopportunity_id: 0fdbdd28-4a95-4bbf-b585-0d2a0bee5d1b\n---\n\nThe revised article. See [Folian](/product).';
		const record = article(leaked);
		commitRevision(record, leaked, 'structural_repair', 'Removed internal metadata from the article body.');
		expect(record.body).toBe('The revised article. See [Folian](/product).');
		expect(record.body).not.toContain('opportunity_id');
		expect(record.versions[0]?.body).toContain('opportunity_id');
		expect(record.workspace?.revision?.number).toBe(2);
		expect(record.workspace?.revision?.source).toBe('structural_repair');
	});

	it('archives the previous article body before saving a new revision', () => {
		const record = article('The published article body.');
		commitRevision(record, 'A revised paragraph.', 'manual', 'Content edit');
		expect(record.body).toBe('A revised paragraph.');
		expect(record.versions[0]?.body).toBe('The published article body.');
		expect(record.versions[0]?.revisionId).toBe('rev-1');
		expect(record.workspace?.revision?.number).toBe(2);
	});

	it('keeps the previous revision id when a body is replaced outside the revision writer', () => {
		const record = article('The published article body.');
		record.body = 'Replaced without a revision.';
		ensureRevision(record);
		expect(record.versions.some((version) => version.revisionId === 'rev-1')).toBe(true);
		expect(record.workspace?.revision?.id).not.toBe('rev-1');
	});

	it('stores a metadata proposal without changing the article body or approving it', () => {
		const record = article('The published article body.');
		storeMetadataProposal(record, {
			proposedSeoTitle: 'ChatGPT for Novel Writing: Uses & Limits | Folian',
			proposedMetaDescription: 'Explore how ChatGPT can help with novel ideas, characters, plots and scene rewrites, and where long-form fiction still needs a story bible.',
			rationale: 'The page is shown in search and the click rate is low.',
			evidence: '821 impressions, CTR 0.61%, average position 8.7.',
			sourceUrl: 'https://folian.app/articles/chatgpt-for-novel-writing',
			baselineCmsRevision: 2,
			baselineContentRevisionId: 'rev-1',
		});
		expect(record.body).toBe('The published article body.');
		expect(record.workspace?.metadataProposal?.status).toBe('pending');
		expect(record.workspace?.brief?.instructions).toMatch(/click rate/);
		expect(record.approval.status).toBe('pending');
		approveMetadataProposalRecord(record);
		expect(record.workspace?.metadataProposal?.status).toBe('approved');
		expect(record.approval.status).toBe('pending');
		expect(record.body).toBe('The published article body.');
		expect(record.seo.seoTitle).toContain('Uses & Limits');
	});

	it('routes a low-click existing page to metadata work and keeps it out of new-article capacity', () => {
		expect(workTypeForOpportunity({ recommendedAction: 'update', evidence: [{ metrics: { impressions: 821, clicks: 5, ctr: 0.0061, position: 8.7, scope: 'page' } }] })).toBe('metadata');
		expect(workTypeForOpportunity({ recommendedAction: 'create', evidence: [] })).toBe('new_article');
		const now = Date.parse('2026-11-21T00:00:00.000Z');
		const usage = productionCapacity([
			{ createdAt: '2026-11-17T13:18:04.000Z', status: 'completed' },
			{ createdAt: '2026-11-20T00:00:00.000Z', status: 'ready_for_approval', workType: 'metadata' },
		], now, 3);
		expect(countsAsArticleStart({ status: 'completed' })).toBe(true);
		expect(usage.started).toBe(1);
		expect(usage.remaining).toBe(2);
	});

	it('refuses a metadata update when the remote CMS revision changed', () => {
		const decision = metadataApplyDecision({ approved: true, baseUpdatedAt: '2026-10-28T19:01:04.346Z', currentUpdatedAt: '2026-10-28T19:01:04.346Z', live: true, baseRevision: 2, currentRevision: 3 });
		expect(decision.apply).toBe(false);
		if (!decision.apply) expect(decision.reason).toMatch(/revision 2/);
	});

	it('keeps QA records out of the overview and distinguishes a paused campaign from a scheduled start', () => {
		expect(isQaRecord('How to Plan a Novel (QA copy)')).toBe(true);
		const view = buildContentOverview({
			paused: true,
			publishingEnabled: false,
			started: 3,
			remaining: 0,
			nextSlotAt: '2026-11-24T13:18:04.000Z',
			weeklyMaximum: 3,
			opportunities: [{ id: 'new', title: 'how to track clues', status: 'approved', recommendedAction: 'create' }],
			jobs: [],
			articles: [{ id: 'qa', title: 'How to Plan a Novel (QA copy)', status: 'review', updatedAt: '2026-11-21T00:00:00.000Z' }, { id: 'live', title: 'ChatGPT for Novel Writing', status: 'published', cmsState: 'published', localChangesPending: true, updatedAt: '2026-11-20T00:00:00.000Z' }],
		});
		expect(view.metrics.review).toBe(0);
		expect(view.metrics.published).toBe(1);
		expect(view.campaign.nextSlotAt).toBeNull();
		expect(view.actions.some((item) => item.detail.includes('no scheduled start'))).toBe(true);
		expect(view.actions.some((item) => item.title.includes('QA'))).toBe(false);
		const content = APP_NAV.find((item) => item.label === 'Content');
		const intelligence = APP_NAV.find((item) => item.label === 'Intelligence');
		expect(content?.items?.some((item) => item.label === 'Diagnostics')).toBe(false);
		expect(intelligence?.items?.some((item) => item.href === '/intelligence?tab=diagnostics')).toBe(true);
	});
});
