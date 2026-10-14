import { createHash } from 'crypto';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { assertMemoryChannelConstraints } from '@/lib/channels/validateMemory';
import { fingerprintArticle, fingerprintContent } from './approvals';
import { fingerprintReplyDraft } from '@/lib/threads/replyFingerprint';
import { getAgentStore } from './controlStore';
import { AgentError } from './errors';
import type { ApprovalRequest } from './types';
import { gstDatetimeLocalValueToUtcIso } from '@/lib/datetime/gstSchedule';

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function assertEditable(request: ApprovalRequest): void {
	if (request.status !== 'PENDING') {
		throw new AgentError('approval_already_resolved', 'This approval request is already resolved.', 409);
	}
	if (Date.parse(request.expiresAt) <= Date.now()) {
		throw new AgentError('approval_expired', 'This approval request has expired.', 410);
	}
}

export type ApprovalEditInput = {
	body: string;
	title?: string | null;
	cta?: string | null;
	publishAt?: string | null;
	publishAtLocalGst?: string | null;
};

export type ApprovalEditResult = {
	request: ApprovalRequest;
};

async function applyApprovalEdit(request: ApprovalRequest, userId: string, raw: ApprovalEditInput): Promise<ApprovalEditResult> {
	if (request.ownerUserId !== userId) {
		throw new AgentError('approval_not_authorized', 'This approval belongs to a different CCE account.', 403);
	}
	assertEditable(request);

	let publishAt: string | null | undefined = raw.publishAt;
	if (raw.publishAtLocalGst?.trim()) {
		publishAt = gstDatetimeLocalValueToUtcIso(raw.publishAtLocalGst);
	}

	const body = raw.body;
	const title = raw.title?.trim() ? raw.title.trim() : undefined;
	const cta = raw.cta?.trim() ? raw.cta.trim() : undefined;

	if (request.targetType === 'reply') {
		const store = getAgentStore();
		const interaction = await store.getInteraction(request.ownerUserId, request.targetId);
		if (!interaction) throw new AgentError('not_found', 'The reply draft for this approval no longer exists.', 404);
		interaction.draftReply = body;
		await store.saveInteraction(request.ownerUserId, interaction);
		request.preview = { ...request.preview, body };
		request.contentHash = fingerprintReplyDraft(interaction);
		await store.saveApprovalRequest(request);
		return { request };
	}

	if (request.targetType === 'article') {
		const articles = getNativeContentStore();
		const article = await articles.getArticle(request.ownerUserId, request.targetId);
		if (!article) throw new AgentError('not_found', 'The article for this approval no longer exists.', 404);
		if (title != null) article.title = title;
		article.body = body;
		article.updatedAt = new Date().toISOString();
		await articles.saveArticle(article);
		request.preview = {
			...request.preview,
			title: article.title,
			body,
			excerpt: article.excerpt ?? body.slice(0, 280),
			...(publishAt !== undefined ? { publishAt } : {}),
		};
		if (publishAt !== undefined) {
			request.parameters = { ...request.parameters, publishAt };
			request.parameterHash = createHash('sha256').update(JSON.stringify(request.parameters)).digest('hex');
		}
		request.contentHash = fingerprintArticle(article);
		await getAgentStore().saveApprovalRequest(request);
		return { request };
	}

	if (request.targetType === 'content') {
		const intelligence = getIntelligenceStore();
		const memory = await intelligence.getMemory(request.ownerUserId, request.targetId);
		if (!memory) throw new AgentError('not_found', 'The content for this approval no longer exists.', 404);

		const updated = {
			...memory,
			body,
			...(title != null ? { hook: title } : {}),
			...(cta != null ? { cta } : {}),
		};
		assertMemoryChannelConstraints(updated);
		await intelligence.saveMemory(request.ownerUserId, updated);

		request.preview = {
			...request.preview,
			body,
			title: updated.hook ?? null,
			...(cta != null ? { cta } : {}),
			...(publishAt !== undefined ? { publishAt } : {}),
		};
		if (publishAt !== undefined) {
			request.parameters = { ...request.parameters, publishAt };
			request.parameterHash = createHash('sha256').update(JSON.stringify(request.parameters)).digest('hex');
		}
		request.contentHash = fingerprintContent(updated);
		await getAgentStore().saveApprovalRequest(request);
		return { request };
	}

	throw new AgentError('invalid_input', 'Unsupported approval target.', 400);
}

export async function updatePendingApprovalFromToken(input: {
	token: string;
	userId: string;
	edit: ApprovalEditInput;
}): Promise<ApprovalEditResult> {
	const store = getAgentStore();
	const request = await store.getApprovalRequestByTokenHash(hashToken(input.token));
	if (!request) throw new AgentError('not_found', 'This approval link is not valid.', 404);
	return applyApprovalEdit(request, input.userId, input.edit);
}

export async function updatePendingApprovalById(input: {
	requestId: string;
	userId: string;
	edit: ApprovalEditInput;
}): Promise<ApprovalEditResult> {
	const store = getAgentStore();
	const request = await store.getApprovalRequest(input.requestId);
	if (!request) throw new AgentError('not_found', 'This approval request was not found.', 404);
	return applyApprovalEdit(request, input.userId, input.edit);
}
