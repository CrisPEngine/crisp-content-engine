import { classifyEditorialWork, remainingCapacity, selectProductionOpportunities } from './productionPolicy';
import { getOpportunityRepository } from './repository';
import type { ProductionJob, ProductionStage } from './types';
import { CampaignError } from './service';

const STAGES: ProductionStage[] = ['research', 'brief', 'draft', 'editorial', 'corrections', 'seo', 'hero', 'quality', 'approval'];

function nextStage(stage: ProductionStage): ProductionStage | null {
	const index = STAGES.indexOf(stage);
	return index < 0 || index === STAGES.length - 1 ? null : STAGES[index + 1]!;
}

function blankJob(input: { brandId: string; campaignId: string | null; opportunityId: string }): ProductionJob {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		brandId: input.brandId,
		campaignId: input.campaignId,
		opportunityId: input.opportunityId,
		articleId: null,
		stage: 'research',
		status: 'queued',
		attempt: 0,
		note: 'Waiting to research the approved opportunity.',
		error: null,
		costUsd: 0,
		stageLog: [],
		createdAt: now,
		updatedAt: now,
	};
}

export async function startProductionJob(userId: string, opportunityId: string, campaignId: string | null = null): Promise<ProductionJob> {
	const repository = getOpportunityRepository();
	const opportunity = await repository.get(userId, opportunityId);
	if (!opportunity) throw new CampaignError('Opportunity not found.', 404, 'opportunity_missing');
	if (opportunity.status !== 'approved' || (opportunity.recommendedAction !== 'create' && opportunity.recommendedAction !== 'update') || opportunity.scoreDetail.promotionBlocked) {
		throw new CampaignError('Only an approved create or update opportunity can enter production. Nothing was published.', 409, 'opportunity_not_ready');
	}
	const existing = await repository.getJobByOpportunity(userId, opportunityId);
	if (existing) return existing;
	const job = await repository.saveJob(userId, blankJob({ brandId: opportunity.brandId, campaignId, opportunityId }));
	await repository.setStatus(userId, opportunityId, 'in_production');
	return job;
}

export async function advanceProductionJob(userId: string, jobId: string): Promise<ProductionJob> {
	const repository = getOpportunityRepository();
	const job = await repository.getJob(userId, jobId);
	if (!job) throw new CampaignError('Production job not found.', 404, 'job_missing');
	if (job.status === 'paused' || job.status === 'ready_for_approval' || job.status === 'needs_attention') return job;
	if (job.articleId) {
		const workspace = await import('@/lib/articles/workspace');
		const current = await workspace.getWorkspaceArticle(userId, job.articleId);
		const state = current.article.library?.publication?.state;
		const remoteStatus = current.article.workspace?.cms.remoteStatus;
		if (state === 'verified_live' || state === 'published' || remoteStatus === 'published' || current.article.publication?.url) {
			job.status = 'needs_attention';
			job.error = 'This article is already live. The worker did not regenerate or publish it.';
			job.note = job.error;
			return repository.saveJob(userId, job);
		}
	}
	const opportunity = await repository.get(userId, job.opportunityId);
	if (!opportunity) throw new CampaignError('The opportunity for this job is missing.', 404, 'opportunity_missing');
	job.status = 'running';
	job.attempt += 1;
	await repository.saveJob(userId, job);
	try {
		const result = await runStage(userId, job, opportunity);
		job.articleId = result.articleId ?? job.articleId;
		if (typeof result.costUsd === 'number') job.costUsd = Math.round((job.costUsd + result.costUsd) * 1_000_000) / 1_000_000;
		else if (result.modelCall) result.note = `${result.note} A model call ran, but its cost was not returned.`;
		job.stageLog = [...job.stageLog, { stage: job.stage, at: new Date().toISOString(), note: result.note }];
		job.error = result.escalate ?? null;
		job.note = result.note;
		if (result.retry) {
			job.status = 'queued';
			return repository.saveJob(userId, job);
		}
		if (result.escalate) {
			job.status = 'needs_attention';
		} else if (job.stage === 'approval') {
			job.status = 'ready_for_approval';
		} else {
			job.stage = nextStage(job.stage) ?? job.stage;
			job.status = 'queued';
		}
		return repository.saveJob(userId, job);
	} catch (error) {
		job.status = job.attempt >= 2 ? 'needs_attention' : 'failed';
		job.error = error instanceof Error ? error.message : 'The production stage failed.';
		job.note = job.error;
		return repository.saveJob(userId, job);
	}
}

async function runStage(userId: string, job: ProductionJob, opportunity: { title: string; recommendedAction: string; evidence: Array<{ url: string | null; metrics: { position: number; ctr: number; impressions: number; clicks?: number; scope?: 'query' | 'page' } | null }> }): Promise<{ articleId?: string; note: string; costUsd?: number; escalate?: string; modelCall?: boolean; retry?: boolean }> {
	const workspace = await import('@/lib/articles/workspace');
	const evidenceUrls = opportunity.evidence.map((item) => item.url).filter((url): url is string => Boolean(url));
	const evidenceNote = evidenceUrls.slice(0, 8).join('\n');
	const measured = opportunity.evidence.find((item) => item.metrics)?.metrics ?? null;
	const { optimisationScope } = await import('./scoring');
	const scope = opportunity.recommendedAction === 'update' ? optimisationScope(measured ? { impressions: measured.impressions, clicks: measured.clicks ?? 0, ctr: measured.ctr, position: measured.position, startDate: '', endDate: '', scope: measured.scope } : null) : 'expansion';
	const title = opportunity.recommendedAction === 'update' ? `Update proposal: ${opportunity.title}` : opportunity.title;
	if (job.stage === 'research') {
		const created = job.articleId
			? { article: (await workspace.getWorkspaceArticle(userId, job.articleId)).article }
			: await workspace.createArticleBrief(userId, {
				brandId: job.brandId,
				topic: title,
				workingTitle: title,
				primaryKeyword: title,
				searchIntent: 'informational',
				audience: 'The audience already searching for this topic',
				researchRequirements: `Opportunity ${job.opportunityId}. Use only the stored evidence and do not invent demand.\n${evidenceNote}`,
				brief: { instructions: `Preserve opportunity ${job.opportunityId}. Do not publish.` },
			});
		if (!created.article) throw new Error('The article brief could not be created.');
		const researched = await workspace.researchArticle(userId, created.article.id);
		await workspace.approveArticleResearch(userId, researched.id);
		return { articleId: researched.id, note: 'Research was completed and approved for generation.', costUsd: researched.workspace?.generation.estimatedCostUsd ?? 0 };
	}
	if (!job.articleId) throw new Error('This stage needs the article created by research.');
	const articleId = job.articleId;
	if (job.stage === 'brief') {
		if (opportunity.recommendedAction === 'update') {
			const proposal = await writeUpdateProposal({ sourceUrl: evidenceUrls[0] ?? null, scope, measured, topic: opportunity.title, userId });
			await workspace.saveArticleDraft(userId, articleId, { body: proposal.body });
			await workspace.approveArticleBrief(userId, articleId);
			return { articleId, note: `A ${scope} proposal was saved on a new draft. The published article was not changed.`, costUsd: proposal.costUsd ?? undefined, modelCall: true };
		}
		await workspace.enhanceArticleBrief(userId, articleId);
		const approved = await workspace.approveArticleBrief(userId, articleId);
		return { articleId, note: 'The brief was approved.', costUsd: approved.workspace?.generation.estimatedCostUsd ?? 0 };
	}
	if (job.stage === 'draft') {
		if (scope === 'metadata' || scope === 'none') {
			return { articleId, note: `No full rewrite. The change scope is ${scope}. The published article was not changed.` };
		}
		const started = await workspace.startArticleGeneration(userId, articleId);
		const article = started.article;
		if (!article.body.trim()) return { articleId, note: 'Generation was queued and has not finished.', retry: true };
		return { articleId, note: 'The draft was generated.', costUsd: article.workspace?.generation.estimatedCostUsd ?? 0 };
	}
	if (job.stage === 'editorial') {
		if (scope === 'metadata') return { articleId, note: 'Metadata validation does not run full-article structure or conversion checks.' };
		const reviewed = await workspace.critiqueWorkspaceArticle(userId, articleId);
		return { articleId, note: 'Editorial review finished.', costUsd: reviewed.workspace?.generation.estimatedCostUsd ?? 0 };
	}
	if (job.stage === 'corrections') {
		const campaign = job.campaignId ? (await getOpportunityRepository().listCampaigns(userId, job.brandId)).find((item) => item.id === job.campaignId) : null;
		const correction = await applyOpenQualityCorrections(userId, articleId, campaign?.operation?.maxCorrectionAttempts ?? 2);
		if (correction.blockers.length) return { articleId, note: correction.note, escalate: correction.note };
		return { articleId, note: correction.note };
	}
	if (job.stage === 'seo') {
		if (opportunity.recommendedAction === 'update') {
			return { articleId, note: 'SEO suggestions stay on the proposal draft. The live page metadata was not changed.' };
		}
		const article = await workspace.regenerateArticleSeo(userId, articleId, { useAi: true });
		return { articleId, note: 'SEO metadata was generated.', costUsd: article.workspace?.generation.estimatedCostUsd ?? 0 };
	}
	if (job.stage === 'hero') {
		if (opportunity.recommendedAction === 'update') {
			return { articleId, note: 'The hero image on the published page was not changed.' };
		}
		await workspace.prepareArticleImageBrief(userId, articleId, 'hero', { applySuggestedConcept: true });
		const article = await workspace.generateArticleMedia(userId, articleId, 'hero');
		if (!article.workspace?.media.heroUrl) return { articleId, note: 'The hero image was not stored.', escalate: 'Hero image generation did not return an image.' };
		return { articleId, note: 'A hero image was generated.', costUsd: article.workspace.generation.estimatedCostUsd ?? 0 };
	}
	if (job.stage === 'quality') {
		if (scope === 'metadata') {
			const article = (await workspace.getWorkspaceArticle(userId, articleId)).article;
			const { parseMetadataProposal, validateMetadataProposal } = await import('./optimisation');
			const parsed = parseMetadataProposal(article.body);
			if (!parsed?.originalTitle) return { articleId, note: 'The metadata proposal has no original title to compare.', escalate: 'The metadata proposal has no original title to compare.' };
			const validation = validateMetadataProposal(parsed);
			if (!validation.pass) return { articleId, note: validation.checks.filter((check) => !check.pass).map((check) => check.detail).join(' '), escalate: 'The metadata proposal failed validation.' };
			return { articleId, note: 'Metadata checks passed. The published article was not changed.' };
		}
		const article = await workspace.revalidateEditorialFindings(userId, articleId);
		const { articleApprovalGate, openCriticalFindings, ensureWorkspace } = await import('@/lib/articles/meta');
		const { usefulnessBlockers } = await import('@/lib/publishing/payloadPublish');
		const gate = articleApprovalGate(article);
		const critical = openCriticalFindings(ensureWorkspace(article));
		const blockers = usefulnessBlockers(article.workspace?.editorialDesk?.critique?.findings ?? []);
		if (!gate.ok || critical.length || blockers.length) {
			const note = blockers.length ? `Publication is blocked by ${blockers.join(', ')}.` : gate.ok ? 'Critical findings remain.' : gate.message;
			return { articleId, note, escalate: note };
		}
		return { articleId, note: 'Publication quality checks passed. The article was not published.' };
	}
	if (scope === 'metadata') {
		const article = (await workspace.getWorkspaceArticle(userId, articleId)).article;
		const queued = await workspace.queueProposalForApproval(userId, articleId, article.body);
		return { articleId, note: `Metadata proposal ${queued.id} is waiting for a person. Nothing was published.` };
	}
	const queued = await workspace.requestArticleApproval(userId, articleId);
	return { articleId, note: `Article ${queued.id} is waiting for a person. Nothing was published.`, costUsd: queued.workspace?.generation.estimatedCostUsd ?? 0 };
}

async function writeUpdateProposal(input: {
	userId: string;
	sourceUrl: string | null;
	scope: string;
	measured: { impressions: number; ctr: number; position: number } | null;
	topic: string;
}): Promise<{ body: string; costUsd: number | null }> {
	let html = '';
	if (input.sourceUrl) {
		const response = await fetch(input.sourceUrl).catch(() => null);
		html = response?.ok ? await response.text() : '';
	}
	const originalTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
	const originalDescription = html.match(/name="description" content="([^"]+)"/i)?.[1]?.trim() ?? '';
	const excerpt = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
	const metrics = input.measured
		? `${input.measured.impressions} impressions, CTR ${(input.measured.ctr * 100).toFixed(2)}%, average position ${input.measured.position.toFixed(1)}.`
		: 'No Search Console metrics were stored.';
	const { getIntelligenceAi } = await import('@/lib/intelligence/actions');
	const completion = await getIntelligenceAi().completeJson<{ title?: string; description?: string; changes?: Array<{ change?: string; why?: string }> }>(
		'STRATEGY',
		[
			{ role: 'system', content: 'Propose a narrow update to an existing article. Return JSON with title, description, and changes: array of change and why. If scope is metadata, only suggest a title and meta description. Do not rewrite the article. Do not invent product capabilities, statistics, or search volume. Tie every change to the supplied evidence.' },
			{ role: 'user', content: JSON.stringify({ topic: input.topic, sourceUrl: input.sourceUrl, scope: input.scope, metrics, excerpt }) },
		],
		'article_update_proposal',
		input.userId,
	);
	const changes = (completion.data.changes ?? []).filter((item) => item.change && item.why).slice(0, 5);
	const { renderMetadataProposal, validateMetadataProposal } = await import('./optimisation');
	const proposal = {
		kind: 'metadata' as const,
		sourceUrl: input.sourceUrl ?? '',
		query: input.topic,
		originalTitle,
		originalDescription,
		proposedTitle: completion.data.title?.trim() || '',
		proposedDescription: completion.data.description?.trim() || '',
		evidence: metrics,
		rationale: changes.length ? changes.map((item) => `${item.change} Reason: ${item.why}`).join('\n') : 'No specific change was returned.',
	};
	const validation = validateMetadataProposal(proposal);
	return {
		body: renderMetadataProposal({ ...proposal, checks: validation.checks, approvalStatus: validation.pass ? 'pending' : 'blocked' }),
		costUsd: completion.estimatedCostUsd ?? null,
	};
}

export async function revalidateMetadataJob(userId: string, jobId: string): Promise<ProductionJob> {
	const repository = getOpportunityRepository();
	const job = await repository.getJob(userId, jobId);
	if (!job?.articleId) throw new CampaignError('This job has no proposal to validate.', 404, 'proposal_missing');
	const workspace = await import('@/lib/articles/workspace');
	const article = (await workspace.getWorkspaceArticle(userId, job.articleId)).article;
	const { parseMetadataProposal, renderMetadataProposal, validateMetadataProposal } = await import('./optimisation');
	const parsed = parseMetadataProposal(article.body);
	if (!parsed) throw new CampaignError('The existing proposal could not be read. A second proposal was not created.', 409, 'proposal_unreadable');
	let originalTitle = parsed.originalTitle;
	let originalDescription = parsed.originalDescription;
	if ((!originalTitle || !originalDescription) && parsed.sourceUrl) {
		const response = await fetch(parsed.sourceUrl).catch(() => null);
		const html = response?.ok ? await response.text() : '';
		originalTitle = originalTitle || html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
		originalDescription = originalDescription || html.match(/name="description" content="([^"]+)"/i)?.[1]?.trim() || '';
	}
	const proposal = { ...parsed, originalTitle, originalDescription };
	const validation = validateMetadataProposal(proposal);
	const body = renderMetadataProposal({ ...proposal, checks: validation.checks, approvalStatus: validation.pass ? 'pending' : 'blocked' });
	const logged = await proposalCost(userId, job.createdAt);
	if (typeof logged === 'number' && job.costUsd === 0) job.costUsd = logged;
	if (!validation.pass) {
		await workspace.saveArticleDraft(userId, job.articleId, { body });
		job.status = 'needs_attention';
		job.error = validation.checks.filter((check) => !check.pass).map((check) => check.detail).join(' ');
		job.note = job.error;
		return repository.saveJob(userId, job);
	}
	await workspace.queueProposalForApproval(userId, job.articleId, body);
	job.stage = 'approval';
	job.status = 'ready_for_approval';
	job.error = null;
	job.note = typeof logged === 'number'
		? 'Metadata checks passed. The existing proposal is waiting for a person. The published article was not changed.'
		: 'Metadata checks passed. The existing proposal is waiting for a person. Its model cost was not found on the usage log, so it is unknown rather than zero. The published article was not changed.';
	return repository.saveJob(userId, job);
}

async function proposalCost(userId: string, since: string): Promise<number | null> {
	try {
		const { getSupabaseService } = await import('@/lib/supabaseService');
		const { data, error } = await getSupabaseService()
			.from('ai_usage_logs')
			.select('estimated_cost_usd, created_at')
			.eq('user_id', userId)
			.eq('feature', 'article_update_proposal')
			.gte('created_at', since);
		if (error || !data?.length) return null;
		const costs = data.map((row) => row.estimated_cost_usd).filter((value): value is number => typeof value === 'number');
		if (!costs.length) return null;
		return Math.round(costs.reduce((sum, value) => sum + value, 0) * 1_000_000) / 1_000_000;
	} catch {
		return null;
	}
}

export async function applyOpenQualityCorrections(userId: string, articleId: string, maxCorrections = 2): Promise<{ applied: number; blockers: string[]; revision: number | null; note: string; published: false }> {
	const workspace = await import('@/lib/articles/workspace');
	let article = await workspace.critiqueWorkspaceArticle(userId, articleId);
	let applied = 0;
	let revision: number | null = article.workspace?.revision?.number ?? null;
	for (let pass = 0; pass < maxCorrections; pass += 1) {
		const findings = article.workspace?.editorialDesk?.critique?.findings ?? [];
		for (const finding of findings) {
			const material = ['intro-weak', 'opening-guide', 'definition-thin', 'cta-weak', 'answers-indirect', 'example-conflict'].includes(finding.id) || finding.category === 'repetition' || finding.category === 'structure';
			if (finding.status !== 'open' || !material) continue;
			const queued = (article.workspace?.editorialDesk?.proposals ?? []).some((item) => item.sourceFindingId === finding.id && item.status !== 'applied');
			if (queued) continue;
			const instruction = finding.category === 'examples'
				? `Resolve only this fictional contradiction: ${finding.evidence.join('; ')}. ${finding.recommendation} Change only those passages. Do not rewrite unrelated sections, and do not add sources, statistics, or product capabilities.`
				: `${finding.recommendation} Change only the passage this finding names. Do not add sources, statistics, or unverified product capabilities.`;
			article = await workspace.queueEditorialChange(userId, articleId, {
				findingId: finding.id,
				instruction,
				reason: finding.explanation,
				section: finding.section,
				status: 'proposed',
			});
		}
		const desk = article.workspace?.editorialDesk;
		const decision = classifyEditorialWork({
			proposals: desk?.proposals ?? [],
			findings: (desk?.critique?.findings ?? []).map((finding) => ({ id: finding.id, severity: finding.severity, category: finding.category, status: finding.status })),
			correctionAttempts: pass,
			maxCorrections,
		});
		if (decision.escalate) return { applied, blockers: decision.escalate ? [decision.escalate] : [], revision, note: decision.escalate, published: false };
		if (!decision.acceptIds.length) break;
		for (const id of decision.acceptIds) article = await workspace.decideEditorialProposal(userId, articleId, id, 'accepted');
		await workspace.previewAcceptedEditorialProposals(userId, articleId);
		const result = await workspace.applyAcceptedEditorialProposals(userId, articleId);
		article = result.article;
		revision = article.workspace?.revision?.number ?? revision;
		applied += decision.acceptIds.length;
	}
	await workspace.revalidateEditorialFindings(userId, articleId);
	const { usefulnessBlockers } = await import('@/lib/publishing/payloadPublish');
	const blockers = usefulnessBlockers(article.workspace?.editorialDesk?.critique?.findings ?? []);
	const note = blockers.length
		? `Significant findings remain after correction: ${blockers.join(', ')}.`
		: applied
			? `Applied ${applied} targeted correction${applied === 1 ? '' : 's'} on revision ${revision ?? 'current'}. Editorial review ran again. Nothing was published.`
			: 'Editorial review ran again. No targeted rewrite was required. Nothing was published.';
	return { applied, blockers, revision, note, published: false };
}

export async function runProductionToApproval(userId: string, jobId: string): Promise<ProductionJob> {
	const repository = getOpportunityRepository();
	let job = await repository.getJob(userId, jobId);
	if (!job) throw new CampaignError('Production job not found.', 404, 'job_missing');
	if (job.status === 'needs_attention') {
		job.status = 'queued';
		job.error = null;
		job.note = 'Resumed the same production job. No new article was created.';
		job = await repository.saveJob(userId, job);
	}
	for (let step = 0; step < 12; step += 1) {
		if (job.status === 'ready_for_approval' || job.status === 'needs_attention' || job.status === 'completed' || job.status === 'paused') return job;
		job = await advanceProductionJob(userId, job.id);
		if (job.note.includes('has not finished') && job.articleId) {
			const workspace = await import('@/lib/articles/workspace');
			const article = (await workspace.getWorkspaceArticle(userId, job.articleId)).article;
			const generationId = article.workspace?.generation.jobId;
			if (generationId) {
				const { runArticleGenerationInline } = await import('@/lib/articles/generationJob');
				await runArticleGenerationInline(generationId);
			}
		}
	}
	return job;
}

export async function finishProposalJob(userId: string, articleId: string, outcome: 'approved' | 'rejected' | 'changes'): Promise<ProductionJob | null> {
	const repository = getOpportunityRepository();
	const job = await repository.getJobByArticle(userId, articleId);
	if (!job) return null;
	if (outcome === 'approved') {
		job.status = 'completed';
		job.note = 'A person approved the proposal. Nothing was published and the live article was not changed.';
	} else if (outcome === 'rejected') {
		job.status = 'needs_attention';
		job.note = 'A person rejected the proposal. Nothing was published.';
	} else {
		job.status = 'needs_attention';
		job.note = 'A person asked for changes. Nothing was published.';
	}
	job.error = null;
	return repository.saveJob(userId, job);
}

export async function scheduleCampaign(userId: string, brandId: string, campaignId: string): Promise<{ started: ProductionJob[]; remaining: number }> {
	const repository = getOpportunityRepository();
	const campaign = (await repository.listCampaigns(userId, brandId)).find((item) => item.id === campaignId);
	if (!campaign) throw new CampaignError('Campaign not found.', 404, 'campaign_missing');
	if (campaign.status === 'paused') return { started: [], remaining: 0 };
	if (campaign.approvalMode === 'auto_publish' || campaign.autoPublishEnabled) {
		throw new CampaignError('Auto-publish stays off.', 403, 'auto_publish_locked');
	}
	const jobs = await repository.listJobs(userId, campaign.brandId);
	const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const startedThisWeek = jobs.filter((job) => new Date(job.createdAt).getTime() >= weekAgo).length;
	const remaining = remainingCapacity(campaign.weeklyCapacity, startedThisWeek);
	const opportunities = await repository.list(userId, campaign.brandId);
	const chosen = selectProductionOpportunities({ opportunities, opportunityIdsInProduction: jobs.map((job) => job.opportunityId), remaining });
	const started: ProductionJob[] = [];
	for (const opportunity of chosen) started.push(await startProductionJob(userId, opportunity.id, campaign.id));
	return { started, remaining: remaining - started.length };
}
