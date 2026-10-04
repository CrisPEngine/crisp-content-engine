import { createHash, randomBytes } from 'crypto';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { getAgentStore } from './controlStore';
import { AgentError } from './errors';
import type { AgentCredential, ApprovalRequest } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function fingerprintContent(memory: Pick<ContentMemoryRecord, 'topic' | 'hook' | 'argument' | 'cta' | 'body' | 'channel'>): string {
	return createHash('sha256')
		.update(JSON.stringify({
			topic: memory.topic ?? '',
			hook: memory.hook ?? '',
			argument: memory.argument ?? '',
			cta: memory.cta ?? '',
			body: memory.body ?? '',
			channel: memory.channel,
		}))
		.digest('hex');
}

export function fingerprintArticle(article: { title: string; body: string }): string {
	return createHash('sha256').update(JSON.stringify({ title: article.title, body: article.body })).digest('hex');
}

function appBase(): string {
	return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io').replace(/\/$/, '');
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createApprovalRequest(input: {
	credential: AgentCredential;
	brandId: string;
	targetType: 'content' | 'article';
	targetId: string;
	requestedAction: 'approve_content' | 'approve_and_schedule';
	publishAt?: string;
}): Promise<{ request: ApprovalRequest; approvalUrl: string }> {
	if (input.requestedAction === 'approve_and_schedule' && !input.publishAt) {
		throw new AgentError('invalid_input', 'approve_and_schedule requires the exact publishAt time.', 400);
	}
	const store = getIntelligenceStore();
	const articles = getNativeContentStore();
	let contentHash = '';
	let summary = '';
	let preview: Record<string, unknown> = {};
	if (input.targetType === 'content') {
		const memory = await store.getMemory(input.credential.ownerUserId, input.targetId);
		if (!memory || memory.brandBrainId !== input.brandId) throw new AgentError('brand_not_accessible', 'This agent cannot access that content.', 403);
		if (memory.publicationStatus === 'published') throw new AgentError('content_already_published', 'Published content cannot be approved again.', 409);
		contentHash = fingerprintContent(memory);
		summary = memory.topic || memory.hook || 'Content approval';
		preview = {
			channel: memory.channel,
			topic: memory.topic ?? null,
			body: (memory.body ?? '').slice(0, 1200),
			status: memory.publicationStatus,
			publishAt: input.publishAt ?? null,
		};
	} else {
		const article = await articles.getArticle(input.credential.ownerUserId, input.targetId);
		if (!article || article.brandId !== input.brandId) throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
		contentHash = fingerprintArticle(article);
		summary = article.title;
		preview = { title: article.title, excerpt: article.excerpt ?? article.body.slice(0, 1200), status: article.status, publishAt: input.publishAt ?? null };
	}
	const parameters = { requestedAction: input.requestedAction, publishAt: input.publishAt ?? null, targetType: input.targetType, targetId: input.targetId };
	const token = randomBytes(32).toString('base64url');
	const now = new Date();
	const request: ApprovalRequest = {
		id: crypto.randomUUID(),
		ownerUserId: input.credential.ownerUserId,
		brandId: input.brandId,
		credentialId: input.credential.id,
		action: input.requestedAction,
		targetType: input.targetType,
		targetId: input.targetId,
		summary,
		preview,
		consequenceLevel: input.requestedAction === 'approve_and_schedule' ? 2 : 2,
		requestedAction: input.requestedAction,
		parameters,
		parameterHash: createHash('sha256').update(JSON.stringify(parameters)).digest('hex'),
		contentHash,
		status: 'PENDING',
		tokenHash: hashToken(token),
		createdAt: now.toISOString(),
		expiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
		executionStatus: 'pending',
	};
	await getAgentStore().saveApprovalRequest(request);
	return { request, approvalUrl: `${appBase()}/approve/${token}` };
}

export async function resolveApprovalRequest(input: { token: string; userId: string; decision: 'approve' | 'reject' }): Promise<ApprovalRequest> {
	const store = getAgentStore();
	const current = await store.getApprovalRequestByTokenHash(hashToken(input.token));
	if (!current) throw new AgentError('not_found', 'This approval link is not valid.', 404);
	if (current.ownerUserId !== input.userId) {
		throw new AgentError('approval_not_authorized', 'This approval belongs to a different CCE account.', 403);
	}
	if (current.status !== 'PENDING') {
		throw new AgentError('approval_already_resolved', 'This approval request is already resolved.', 409);
	}
	if (Date.parse(current.expiresAt) <= Date.now()) {
		current.status = 'EXPIRED';
		current.executionStatus = 'failed';
		await store.saveApprovalRequest(current);
		throw new AgentError('approval_expired', 'This approval request has expired.', 410);
	}
	const freshHash = await currentFingerprint(current);
	if (freshHash !== current.contentHash) {
		current.status = 'CANCELLED';
		current.executionStatus = 'failed';
		current.resolvedAt = new Date().toISOString();
		current.authorizationMethod = 'cce_authenticated_page';
		await store.saveApprovalRequest(current);
		throw new AgentError('content_changed', 'The content changed after this approval was requested. Create a new approval.', 409);
	}
	const now = new Date().toISOString();
	if (input.decision === 'reject') {
		current.status = 'REJECTED';
		current.resolvedAt = now;
		current.resolvedBy = input.userId;
		current.authorizationMethod = 'cce_authenticated_page';
		current.executionStatus = 'not_executed';
		await store.saveApprovalRequest(current);
		return current;
	}
	await applyHumanApproval(current, input.userId);
	current.status = 'APPROVED';
	current.resolvedAt = now;
	current.resolvedBy = input.userId;
	current.authorizationMethod = 'cce_authenticated_page';
	current.executionStatus = 'executed';
	await store.saveApprovalRequest(current);
	return current;
}

async function currentFingerprint(request: ApprovalRequest): Promise<string> {
	if (request.targetType === 'article') {
		const article = await getNativeContentStore().getArticle(request.ownerUserId, request.targetId);
		if (!article) return '';
		return fingerprintArticle(article);
	}
	const memory = await getIntelligenceStore().getMemory(request.ownerUserId, request.targetId);
	if (!memory) return '';
	return fingerprintContent(memory);
}

async function applyHumanApproval(request: ApprovalRequest, userId: string): Promise<void> {
	const approvedAt = new Date().toISOString();
	const publishAt = typeof request.parameters.publishAt === 'string' ? request.parameters.publishAt : undefined;
	if (request.targetType === 'content') {
		const intelligence = getIntelligenceStore();
		const memory = await intelligence.getMemory(request.ownerUserId, request.targetId);
		if (!memory) throw new AgentError('not_found', 'The content for this approval no longer exists.', 404);
		const schedule = request.requestedAction === 'approve_and_schedule';
		await intelligence.saveMemory(request.ownerUserId, {
			...memory,
			publicationStatus: schedule ? 'scheduled' : 'approved',
			publicationDate: schedule ? publishAt : memory.publicationDate,
			metadata: {
				...(memory.metadata ?? {}),
				approvedByUserId: userId,
				approvalRequestId: request.id,
				approvalContentHash: request.contentHash,
				approvedAt,
				authorizationMethod: 'cce_authenticated_page',
				requestingCredentialId: request.credentialId,
			},
		});
		return;
	}
	const articles = getNativeContentStore();
	const article = await articles.getArticle(request.ownerUserId, request.targetId);
	if (!article) throw new AgentError('not_found', 'The article for this approval no longer exists.', 404);
	article.status = 'approved';
	article.approval = { required: true, approver: 'human', status: 'approved' };
	article.updatedAt = approvedAt;
	await articles.saveArticle(article);
}

export async function assertScheduleMatchesApproval(memory: ContentMemoryRecord): Promise<void> {
	const hash = memory.metadata?.approvalContentHash;
	if (typeof hash !== 'string') return;
	if (hash !== fingerprintContent(memory)) {
		const requestId = memory.metadata?.approvalRequestId;
		if (typeof requestId === 'string') {
			const request = await getAgentStore().getApprovalRequest(requestId);
			if (request && request.status === 'APPROVED') {
				request.status = 'CANCELLED';
				request.executionStatus = 'failed';
				await getAgentStore().saveApprovalRequest(request);
			}
		}
		throw new AgentError('content_changed', 'The approved content changed. It needs a new human approval before it can be scheduled.', 409);
	}
}
