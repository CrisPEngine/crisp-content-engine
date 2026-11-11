import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { articleApprovalGate, articleNextStep, articleScheduleGate, imagesRequired, matchesArticleView } from '@/lib/articles/meta';
import { contentHash } from '@/lib/articles/revisions';
import { articleWordCount, validateArticleStructure } from '@/lib/articles/structure';
import {
	applyAcceptedRevisions,
	applyAcceptedEditorialProposals,
	approveArticleBrief,
	approveArticleResearch,
	approveWorkspaceArticle,
	approveWorkspaceEditorialBrief,
	createArticleBrief,
	decideEditorialProposal,
	decideRecommendation,
	editArticleResearch,
	generateWorkspaceEditorialBrief,
	getWorkspaceArticle,
	previewAcceptedEditorialProposals,
	recordEditorialFeedback,
	restoreWorkspaceRevision,
	saveArticleDraft,
	scheduleWorkspaceArticle,
	startArticleGeneration,
} from '@/lib/articles/workspace';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { setIntelligenceAiForTests, setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { createMemoryNativeContentStore, getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { ArticleRecord } from '@/lib/articles/types';

const HEADINGS = ['Turn your idea into a premise', 'Plan the shape of the story', 'Write the first draft', 'Finish and rest the draft'];

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(_role: string, messages: Array<{ content: string }>, feature: string) {
			const user = messages[messages.length - 1]?.content ?? '';
			if (feature === 'article_outline') {
				return { data: { title: 'ignored', searchIntent: 'informational', sections: HEADINGS.map((heading) => ({ heading, purpose: `Explain ${heading}.` })) } as T, model: 'stub' };
			}
			if (feature === 'article_section') {
				const heading = HEADINGS.find((item) => user.includes(item)) ?? HEADINGS[0];
				return {
					data: { body: `## ${heading}\n\nThis section explains ${heading.toLowerCase()} in plain steps a new novelist can follow today. Each step ends with something written down.` } as T,
					model: 'stub-writer',
				};
			}
			if (feature === 'article_revision') {
				const input = JSON.parse(user) as { text: string; recommendations: Array<{ id: string }> };
				return {
					data: {
						body: `${input.text}\n\nWhen the draft is finished, put it away for two weeks before you reread it.`,
						results: input.recommendations.map((item) => ({ id: item.id, applied: true, change: 'Added a closing step.' })),
					} as T,
					model: 'stub-writer',
				};
			}
			return { data: {} as T, model: 'stub' };
		},
	};
}

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

async function generatedArticle() {
	const brain = await brand();
	const { article } = await createArticleBrief(FOLIAN_USER_ID, {
		brandId: brain.id,
		topic: 'How to Write a Novel: From Idea to First Draft',
		searchIntent: 'informational',
		imageRequirements: 'none',
		targetWords: 1500,
		brief: { questions: 'How do I start?\nHow do I finish a first draft?' },
	});
	await expect(startArticleGeneration(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'brief_not_approved' });
	await approveArticleBrief(FOLIAN_USER_ID, article.id);
	await expect(startArticleGeneration(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'research_not_approved' });
	await editArticleResearch(FOLIAN_USER_ID, article.id, { op: 'add_evidence', text: 'I wrote my first novel in 500-word sessions before work.' });
	await approveArticleResearch(FOLIAN_USER_ID, article.id);
	await startArticleGeneration(FOLIAN_USER_ID, article.id);
	const saved = (await getNativeContentStore().getArticle(FOLIAN_USER_ID, article.id)) as ArticleRecord;
	return { brain, article: saved };
}

describe('article workspace', () => {
	beforeEach(() => {
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		setAgentStoreForTests(createMemoryAgentStore());
		setIntelligenceAiForTests(stubAi());
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		setNativeContentStoreForTests(undefined);
		setAgentStoreForTests(undefined);
	});

	it('reuses an article when the external id or title already exists', async () => {
		const brain = await brand();
		const first = await createArticleBrief(FOLIAN_USER_ID, {
			brandId: brain.id,
			topic: 'How to Write a Novel: From Idea to First Draft',
			externalId: 'cce_pillar_novel-first-draft',
			targetWords: 3000,
		});
		const second = await createArticleBrief(FOLIAN_USER_ID, { brandId: brain.id, topic: 'How to write a novel: from idea to first draft' });
		expect(second.existing).toBe(true);
		expect(second.article.id).toBe(first.article.id);
		expect(await getNativeContentStore().listArticles(FOLIAN_USER_ID, brain.id)).toHaveLength(1);
	});

	it('generates from approved research with one heading per section and records the reviewed revision', async () => {
		const { article } = await generatedArticle();
		const workspace = article.workspace!;
		expect(workspace.generation.status).toBe('completed');
		expect(workspace.generation.researchVersion).toBe(workspace.research?.approved?.version);
		for (const heading of HEADINGS) expect(article.body.match(new RegExp(`^## ${heading}$`, 'gm'))).toHaveLength(1);
		expect(validateArticleStructure(article.body).ok).toBe(true);
		expect(article.excerpt.startsWith('#')).toBe(false);
		expect(article.wordCount).toBe(articleWordCount(article.body));
		expect(workspace.revision?.number).toBe(1);
		expect(workspace.editorial.reviewedRevisionId).toBe(workspace.revision?.id);
		expect(workspace.editorial.reviewedContentHash).toBe(contentHash(article.body));
		expect(article.research.claims.some((claim) => claim.text.includes('500-word sessions'))).toBe(true);
	});

	it('applies accepted recommendations as a new revision, marks them applied and reviews the new revision', async () => {
		const { article } = await generatedArticle();
		const workspace = article.workspace!;
		const firstRevision = workspace.revision!;
		workspace.editorial.findings.push({
			id: 'llm-critical-1',
			severity: 'critical',
			code: 'missing_rest_step',
			dimension: 'topic_completeness',
			instruction: 'Add a step about resting the draft before revision.',
			source: 'llm',
			decision: 'pending',
			rejectable: true,
			revisionId: firstRevision.id,
		});
		workspace.editorial.status = 'findings';
		await getNativeContentStore().saveArticle(article);
		await expect(approveWorkspaceArticle(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'critical_findings' });
		await decideRecommendation(FOLIAN_USER_ID, article.id, 'llm-critical-1', 'accepted');
		await applyAcceptedRevisions(FOLIAN_USER_ID, article.id);
		const detail = await getWorkspaceArticle(FOLIAN_USER_ID, article.id);
		const revised = detail.article.workspace!;
		expect(revised.revision?.number).toBe(2);
		expect(revised.revisionJob?.status).toBe('completed');
		expect(revised.editorial.cyclesUsed).toBe(1);
		expect(revised.editorial.reviewedRevisionId).toBe(revised.revision?.id);
		expect(detail.article.body).toContain('put it away for two weeks');
		expect(detail.article.versions.some((version) => version.revisionId === firstRevision.id)).toBe(true);
		const history = revised.editorial.history ?? [];
		const applied = history.flatMap((run) => run.findings).find((finding) => finding.id === 'llm-critical-1');
		expect(applied?.decision).toBe('applied');
		expect(applied?.appliedInRevisionId).toBe(revised.revision?.id);
		expect(detail.revisionResult?.applied.map((item) => item.id)).toEqual(['llm-critical-1']);
	});

	it('enforces the revision cycle limit and keeps structural findings unrejectable', async () => {
		const { article } = await generatedArticle();
		const workspace = article.workspace!;
		workspace.editorial.findings.push(
			{ id: 'structural', severity: 'critical', code: 'duplicate_heading', dimension: 'writing_quality', instruction: 'Fix it.', source: 'deterministic', decision: 'pending', rejectable: false },
			{ id: 'accepted', severity: 'minor', code: 'tone', dimension: 'brand_voice', instruction: 'Warmer.', source: 'llm', decision: 'accepted', rejectable: true },
		);
		workspace.editorial.cyclesUsed = workspace.editorial.maxCycles;
		await getNativeContentStore().saveArticle(article);
		await expect(decideRecommendation(FOLIAN_USER_ID, article.id, 'structural', 'rejected')).rejects.toMatchObject({ code: 'finding_not_rejectable' });
		await expect(applyAcceptedRevisions(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'review_cycles_exhausted' });
	});

	it('marks review stale after a manual edit and blocks approval until it is rerun', async () => {
		const { article } = await generatedArticle();
		const edited = await saveArticleDraft(FOLIAN_USER_ID, article.id, { body: `${article.body}\n\nOne more complete sentence.` });
		expect(edited.workspace?.revision?.number).toBe(2);
		const gate = articleApprovalGate(edited);
		expect(gate.ok).toBe(false);
		if (!gate.ok) expect(gate.code).toBe('review_stale');
	});

	it('clears brief approval when the brief changes after approval', async () => {
		const brain = await brand();
		const { article } = await createArticleBrief(FOLIAN_USER_ID, { brandId: brain.id, topic: 'Outlining a mystery', searchIntent: 'informational' });
		await approveArticleBrief(FOLIAN_USER_ID, article.id);
		const changed = await saveArticleDraft(FOLIAN_USER_ID, article.id, { brief: { tone: 'Plain and direct' } });
		expect(changed.workspace?.briefApprovedAt).toBeNull();
		expect(changed.workspace?.briefChangedAfterApproval).toBe(true);
		expect(articleNextStep(changed).stage).toBe('Brief');
	});

	it('versions the editorial brief and applies only accepted proposals', async () => {
		const { article } = await generatedArticle();
		const before = article.body;
		const revisionBefore = article.workspace?.revision?.number ?? 0;
		const drafted = await generateWorkspaceEditorialBrief(FOLIAN_USER_ID, article.id, 'Focus on fiction writers.');
		expect(drafted.workspace?.editorialBrief?.current?.status).toBe('draft');
		expect(drafted.workspace?.sectionPlan?.length).toBeGreaterThan(0);
		await approveWorkspaceEditorialBrief(FOLIAN_USER_ID, article.id);
		const revised = await generateWorkspaceEditorialBrief(FOLIAN_USER_ID, article.id, 'Make it more technical.');
		expect(revised.workspace?.editorialBrief?.current?.status).toBe('needs_reapproval');
		expect(revised.workspace?.editorialBrief?.history).toHaveLength(1);
		await expect(startArticleGeneration(FOLIAN_USER_ID, article.id)).rejects.toMatchObject({ code: 'brief_needs_reapproval' });
		const planned = await recordEditorialFeedback(FOLIAN_USER_ID, article.id, 'Open with a realistic continuity mistake. Preserve the practical tables.');
		const proposals = planned.workspace?.editorialDesk?.proposals ?? [];
		const keep = proposals.find((item) => /tables/i.test(item.action));
		const change = proposals.find((item) => /continuity mistake/i.test(item.action));
		expect(keep && change).toBeTruthy();
		await decideEditorialProposal(FOLIAN_USER_ID, article.id, keep!.id, 'rejected');
		await decideEditorialProposal(FOLIAN_USER_ID, article.id, change!.id, 'accepted');
		const extra = proposals.find((item) => item.id !== keep!.id && item.id !== change!.id);
		if (extra) await decideEditorialProposal(FOLIAN_USER_ID, article.id, extra.id, 'deferred');
		const preview = await previewAcceptedEditorialProposals(FOLIAN_USER_ID, article.id);
		expect(preview.body).toBe(before);
		expect(preview.workspace?.editorialDesk?.preview?.preservedIds).toContain(keep!.id);
		const applied = await applyAcceptedEditorialProposals(FOLIAN_USER_ID, article.id);
		expect(applied.article.body.startsWith(before.trim())).toBe(true);
		expect(applied.article.body).not.toContain('Do not remove or restyle existing tables');
		const after = applied.article.workspace?.editorialDesk?.proposals ?? [];
		expect(after.find((item) => item.id === keep!.id)?.status).toBe('rejected');
		expect(after.find((item) => item.id === change!.id)?.status).toBe('applied');
		if (extra) expect(after.find((item) => item.id === extra.id)?.status).toBe('deferred');
		expect(applied.article.workspace?.revision?.number ?? 0).toBeGreaterThan(revisionBefore);
		expect(applied.article.workspace?.revision?.source).toBe('improvement');
		expect(applied.article.workspace?.revision?.note).toContain(change!.id);
		expect(applied.article.workspace?.revision?.note).not.toContain(keep!.id);
		expect(contentHash(applied.article.body)).toBe(applied.article.workspace?.revision?.contentHash);
		const previous = applied.article.versions.at(-1);
		const restored = await restoreWorkspaceRevision(FOLIAN_USER_ID, article.id, previous!.revisionId!);
		expect(restored.body.trim()).toBe(before.trim());
		expect(restored.versions.some((version) => version.instruction?.includes(change!.id) || version.revisionId === applied.article.workspace?.revision?.id)).toBe(true);
		expect(restored.workspace?.revision?.note).toContain('Restored revision');
	});

	it('schedules a website article only after approval and keeps it off the social queue', async () => {
		const brain = await brand();
		const { article } = await createArticleBrief(FOLIAN_USER_ID, {
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
