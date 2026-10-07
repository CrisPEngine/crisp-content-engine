import { getAgentStore } from './controlStore';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { resolveApprovalPublishImagePreview } from '@/lib/publish/approvalPublishImage';
import { resolveApprovalDestinationView } from './approvalDestination';
import { pendingApprovalCounts } from './approvalInbox';
import {
	agentMetaPlatformFromChannel,
	isAgentMetaMemory,
	repairAgentMetaPublishJobIfMissing,
} from '@/lib/publish/agentMetaJob';
import type { ApprovalRequest } from './types';

export type ApprovalPageModel = {
	request: ApprovalRequest;
	brandName: string;
	body: string;
	schedule: boolean;
	publishImagePreview: Awaited<ReturnType<typeof resolveApprovalPublishImagePreview>>;
	destination: Awaited<ReturnType<typeof resolveApprovalDestinationView>>;
	inbox: ReturnType<typeof pendingApprovalCounts>;
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
	const body = String(preview.body ?? preview.excerpt ?? '');

	let memory = null;
	let publishImagePreview = null;
	if (request.targetType === 'content') {
		memory = await intelligence.getMemory(request.ownerUserId, request.targetId);
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

	return {
		request,
		brandName: brain?.identity.name ?? 'Brand',
		body,
		schedule,
		publishImagePreview,
		destination,
		inbox,
	};
}
