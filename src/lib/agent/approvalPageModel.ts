import { getAgentStore } from './controlStore';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { resolveApprovalPublishImagePreview } from '@/lib/publish/approvalPublishImage';
import { resolveApprovalDestinationView } from './approvalDestination';
import { pendingApprovalCounts } from './approvalInbox';
import { isAgentMetaMemory, repairAgentMetaPublishJobIfMissing } from '@/lib/publish/agentMetaJob';
import type { ApprovalRequest } from './types';
import { isRedditPipelineChannel, redditFieldsFromMemory, type RedditPostFields } from '@/lib/channels/reddit';
import { channelBodyCharLimit, channelTitleCharLimit } from '@/lib/content/channelCharLimits';
import { utcIsoToGstDatetimeLocalValue } from '@/lib/datetime/gstSchedule';

export function resolveApprovalDisplayBody(input: {
	previewBody?: unknown;
	previewExcerpt?: unknown;
	sourceBody?: string | null;
}): string {
	if (input.sourceBody) return input.sourceBody;
	return String(input.previewBody ?? input.previewExcerpt ?? '');
}

export type ApprovalPageModel = {
	request: ApprovalRequest;
	brandName: string;
	body: string;
	schedule: boolean;
	threadsReply: boolean;
	replyContext: {
		originalAuthorHandle: string | null;
		originalPostExcerpt: string | null;
		targetUrl: string | null;
	};
	publishImagePreview: Awaited<ReturnType<typeof resolveApprovalPublishImagePreview>>;
	destination: Awaited<ReturnType<typeof resolveApprovalDestinationView>>;
	inbox: ReturnType<typeof pendingApprovalCounts>;
	publishError: string | null;
	publishedPermalink: string | null;
	redditPost: RedditPostFields | null;
	edit: {
		body: string;
		title: string;
		cta: string;
		publishAtGst: string;
		showTitle: boolean;
		showCta: boolean;
		showSchedule: boolean;
		bodyCharLimit: number | null;
		titleCharLimit: number | null;
	} | null;
};

export async function loadApprovalPageModel(input: {
	userId: string;
	request: ApprovalRequest;
}): Promise<ApprovalPageModel> {
	const { userId, request } = input;
	const intelligence = getIntelligenceStore();
	const brain = await intelligence.getBrandBrainById(userId, request.brandId);
	const preview = request.preview;
	const schedule = request.requestedAction === 'approve_and_schedule';
	const threadsReply = request.targetType === 'reply' || request.requestedAction === 'approve_and_post_reply';
	let body = resolveApprovalDisplayBody({ previewBody: preview.body, previewExcerpt: preview.excerpt });
	const replyContext = {
		originalAuthorHandle:
			typeof preview.originalAuthorHandle === 'string' ? preview.originalAuthorHandle : null,
		originalPostExcerpt:
			typeof preview.originalPostExcerpt === 'string' ? preview.originalPostExcerpt : null,
		targetUrl: typeof preview.targetUrl === 'string' ? preview.targetUrl : null,
	};
	const publishError = typeof preview.publishError === 'string' ? preview.publishError : null;
	const publishedPermalink =
		typeof preview.publishedPermalink === 'string' ? preview.publishedPermalink : null;

	let memory = null;
	let publishImagePreview = null;
	if (request.targetType === 'content') {
		memory = await intelligence.getMemory(request.ownerUserId, request.targetId);
		body = resolveApprovalDisplayBody({ previewBody: preview.body, previewExcerpt: preview.excerpt, sourceBody: memory?.body });
		if (memory?.publicationStatus === 'scheduled' && isAgentMetaMemory(memory)) {
			const publishAt =
				(typeof request.parameters.publishAt === 'string' && request.parameters.publishAt) ||
				memory.publicationDate ||
				undefined;
			try {
				await repairAgentMetaPublishJobIfMissing({
					userId: request.ownerUserId,
					memory,
					publishAt,
				});
			} catch {
				// Surface on destination line via publishQueued=false; do not block the page.
			}
			memory = await intelligence.getMemory(request.ownerUserId, request.targetId);
		}
		if (memory) {
			publishImagePreview = await resolveApprovalPublishImagePreview({
				ownerUserId: request.ownerUserId,
				targetType: 'content',
				targetId: request.targetId,
				channel: memory.channel,
				metadata: memory.metadata,
			});
		}
	} else {
		const article = await getNativeContentStore().getArticle(request.ownerUserId, request.targetId);
		body = resolveApprovalDisplayBody({ previewBody: preview.body, previewExcerpt: preview.excerpt, sourceBody: article?.body });
		publishImagePreview = await resolveApprovalPublishImagePreview({
			ownerUserId: request.ownerUserId,
			targetType: 'article',
			targetId: request.targetId,
		});
	}

	const contentScheduledOrApproved =
		request.status === 'APPROVED' ||
		memory?.publicationStatus === 'scheduled' ||
		memory?.publicationStatus === 'approved';

	const destination = await resolveApprovalDestinationView({
		userId: request.ownerUserId,
		airtableBrandId: brain?.airtableBrandId ?? '',
		channel: memory?.channel ?? String(preview.channel ?? ''),
		memory,
		schedule,
		contentScheduledOrApproved,
	});

	const allPending = await getAgentStore().listApprovalRequests(userId, 'PENDING');
	const inbox = pendingApprovalCounts(allPending, request.id);
	const redditPost =
		memory && isRedditPipelineChannel(String(memory.channel)) ? redditFieldsFromMemory(memory) : null;

	const publishAtIso =
		(typeof request.parameters.publishAt === 'string' && request.parameters.publishAt) ||
		(typeof preview.publishAt === 'string' ? preview.publishAt : null);
	const channelKey = memory?.channel ?? String(preview.channel ?? '');
	const showSchedule = schedule && !threadsReply && !redditPost;
	const edit =
		request.status === 'PENDING'
			? {
					body,
					title:
						request.targetType === 'article'
							? String(preview.title ?? '')
							: String(memory?.hook ?? preview.title ?? ''),
					cta: String(memory?.cta ?? preview.cta ?? ''),
					publishAtGst: utcIsoToGstDatetimeLocalValue(publishAtIso),
					showTitle: request.targetType === 'article' || Boolean(redditPost) || request.targetType === 'content',
					showCta: request.targetType === 'content' && !redditPost && !threadsReply,
					showSchedule,
					bodyCharLimit: channelBodyCharLimit(channelKey),
					titleCharLimit: redditPost ? channelTitleCharLimit('reddit') : null,
				}
			: null;

	return {
		request,
		brandName: brain?.identity.name ?? 'Brand',
		body,
		schedule,
		threadsReply,
		replyContext,
		publishImagePreview,
		destination,
		inbox,
		publishError,
		publishedPermalink,
		redditPost,
		edit,
	};
}
