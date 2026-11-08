import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { articleApprovalGate, articleNextStep, articleScheduleGate, imagesRequired, matchesArticleView } from '@/lib/articles/meta';
import { approveWorkspaceArticle, createArticleBrief, requestArticleRevision, scheduleWorkspaceArticle } from '@/lib/articles/workspace';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { createMemoryNativeContentStore, getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { ArticleRecord } from '@/lib/articles/types';

async function brand() {
	const store = createMemoryIntelligenceStore();
	setIntelligenceStoreForTests(store);
	return store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolianWorkspace', {
		identity: folianIdentity,
		voice: folianVoice,
		guardrails: folianGuardrails,
		knowledge: folianKnowledge,
	});
}

describe('article workspace gates', () => {
	beforeEach(() => {
		setNativeContentStoreForTests(createMemoryNativeContentStore());
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('reuses an article when the external id already exists', async () => {
		const brain = await brand();
		const first = await createArticleBrief(FOLIAN_USER_ID, {
			brandId: brain.id,
			topic: 'How to Write a Novel: From Idea to First Draft',
			externalId: 'cce_pillar_novel-first-draft',
			targetWords: 3000,
		});
		const second = await createArticleBrief(FOLIAN_USER_ID, {
			brandId: brain.id,
			topic: 'How to Write a Novel: From Idea to First Draft',
			externalId: 'cce_pillar_novel-first-draft',
		});
		expect(second.id).toBe(first.id);
		expect(await getNativeContentStore().listArticles(FOLIAN_USER_ID, brain.id)).toHaveLength(1);
	});

	it('does not treat a used-up review cycle as approval', async () => {
		const brain = await brand();
		const article = await createArticleBrief(FOLIAN_USER_ID, { brandId: brain.id, topic: 'Continuity' });
		article.workspace!.editorial.cyclesUsed = article.workspace!.editorial.maxCycles;
		article.workspace!.editorial.status = 'blocked';
		article.workspace!.editorial.exhausted = true;
		article.workspace!.editorial.findings = [
			{
				id: 'critical-1',
				severity: 'critical',
				code: 'accuracy',
				dimension: 'accuracy',
				instruction: 'Remove the unsupported claim.',
				source: 'llm',
				decision: 'pending',
			},
		];
		await getNativeContentStore().saveArticle(article);
		await expect(requestArticleRevision(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'review_not_approval' });
		const saved = await getNativeContentStore().getArticle(FOLIAN_USER_ID, article.id);
		expect(saved?.approval.status).toBe('pending');
		expect(saved?.status).not.toBe('approved');
		await expect(approveWorkspaceArticle(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'review_not_approval' });
	});

	it('schedules a website article only after approval and keeps it off the social queue', async () => {
		const brain = await brand();
		const article = await createArticleBrief(FOLIAN_USER_ID, {
			brandId: brain.id,
			topic: 'A scheduled essay',
			destinationId: 'folian',
			imageRequirements: 'none',
		});
		article.status = 'approved';
		article.approval = { required: true, approver: 'human', status: 'approved' };
		article.workspace!.editorial.status = 'ready';
		article.workspace!.editorial.exhausted = false;
		await getNativeContentStore().saveArticle(article);
		const scheduled = await scheduleWorkspaceArticle(FOLIAN_USER_ID, article.id, {
			publishAt: '2026-12-01T09:00:00.000Z',
			destinationId: 'folian',
		});
		expect(scheduled.workspace?.schedule.status).toBe('scheduled');
		expect(scheduled.publishDestination).toBe('folian');
		expect(matchesArticleView(scheduled, 'scheduled')).toBe(true);
		expect(imagesRequired('none')).toBe(false);
		expect(imagesRequired('Hero image')).toBe(true);
	});

	it('tells the owner the next editorial step and does not treat a failed generation as approval', async () => {
		const brain = await brand();
		const article = await createArticleBrief(FOLIAN_USER_ID, { brandId: brain.id, topic: 'A novel draft' });
		expect(articleNextStep(article).stage).toBe('Research');
		article.workspace!.researchSummary.retrievedAt = new Date().toISOString();
		expect(articleNextStep(article).action).toBe('Approve the brief');
		article.workspace!.briefApprovedAt = new Date().toISOString();
		expect(articleNextStep(article).action).toBe('Generate the draft');
		article.body = 'A draft.';
		article.workspace!.generation.status = 'failed';
		article.workspace!.generation.error = 'The model timed out.';
		expect(articleNextStep(article).stage).toBe('Generation failed');
		expect(article.approval.status).toBe('pending');
	});

	it('blocks schedule and approval while review or media gates are open', () => {
		const article = {
			status: 'draft',
			approval: { status: 'pending' },
			workspace: {
				editorial: { status: 'not_run', exhausted: false, findings: [] },
				imageRequirements: 'Hero image',
				media: { deliveryVerified: false },
			},
		} as unknown as ArticleRecord;
		expect(articleApprovalGate(article).ok).toBe(false);
		expect(articleScheduleGate(article, { destinationId: 'folian', publishAt: '2026-12-01T09:00:00.000Z' }).ok).toBe(false);
	});
});
