import { proposedScheduleLabelFromMetadata } from '@/lib/intelligence/scheduleProposal';
import { displayScheduleAt, shouldExcludeFromApprovalStage } from '@/lib/content/nativeQueueSchedule';
import type { BrandBrain } from '@/lib/intelligence/types';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { workflowStatus, type WorkflowStatus } from '@/lib/content/workflow';
import type { ContentPublishDiagnostics } from '@/lib/publish/contentPublishDiagnostics';
import type { PublishJobRow } from '@/lib/publish/contentPublishDiagnostics';
import { schedulePublishWarning } from '@/lib/publish/schedulePublishWarning';
import { brainMatchesBrandFilter, effectiveBrandProfileId } from '@/lib/content/brandFilter';
import { memoryBlocksQueueConfirm } from '@/lib/intelligence/queueBridge';

export type NativeQueueStage = 'approval' | 'schedule' | 'published';

export type NativeQueueListItem = {
	id: string;
	source: 'native';
	title: string;
	platform: string;
	channel: string;
	content: string;
	summary: string;
	status: string;
	workflowStatus: WorkflowStatus;
	content_type?: string;
	scheduled_date: string | null;
	published_at: string | null;
	created_time: string;
	brand_name: string;
	brand_profile_id: string;
	destination: string | null;
	external_url: string | null;
	last_publish_error: string | null;
	publish_job_status: string | null;
	is_overdue: boolean;
	publish_schedule_warning?: string | null;
	hashtags?: string;
	image_prompt?: string;
	image_reference_url?: string;
	linked_asset_id?: string;
	media_path?: string;
	media_selection_reason?: string;
	proposedSchedule?: string | null;
	proposedScheduleKind?: string;
	proposedScheduleAt?: string;
	evidence?: boolean;
	airtableContentId?: string | null;
	queue_hold?: boolean;
};

export function memoryHeldFromQueue(memory: ContentMemoryRecord): boolean {
	return memoryBlocksQueueConfirm(memory);
}

/** Treat scheduled rows with publish evidence as published for queue display only. */
export function memoryForQueueDisplay(
	memory: ContentMemoryRecord,
	job: PublishJobRow | undefined,
): ContentMemoryRecord {
	if (memory.publicationStatus === 'published') return memory;
	const publishedJob = job?.status === 'published';
	const hasExternal = Boolean(memory.externalPostId?.trim() || memory.externalUrl?.trim());
	if (memory.publicationStatus === 'scheduled' && (publishedJob || hasExternal)) {
		return {
			...memory,
			publicationStatus: 'published',
			publicationDate: memory.publicationDate ?? memory.createdAt,
		};
	}
	return memory;
}

export function channelDisplayPlatform(channel: string): string {
	const c = String(channel).toLowerCase();
	if (c === 'linkedin') return 'LinkedIn';
	if (c === 'x') return 'X';
	if (c === 'blog') return 'Blog';
	if (c === 'instagram') return 'Instagram';
	if (c === 'facebook') return 'Facebook';
	if (c === 'threads') return 'Threads';
	if (c === 'reddit') return 'Reddit';
	return channel;
}

/** Approval queue tab filter (Meta = Instagram + Facebook). */
export function matchesPlatformTab(channel: string, tab: string | null | undefined): boolean {
	if (!tab) return true;
	const platform = channelDisplayPlatform(channel);
	if (tab === 'Meta') return platform === 'Instagram' || platform === 'Facebook';
	return platform === tab;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = metadata?.[key];
	return typeof value === 'string' && value.trim() ? value : undefined;
}

export function isScheduledOverdue(memory: Pick<ContentMemoryRecord, 'publicationStatus' | 'publicationDate'>): boolean {
	if (memory.publicationStatus !== 'scheduled' || !memory.publicationDate) return false;
	const due = new Date(memory.publicationDate);
	return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export function uiStatusLabel(
	ws: WorkflowStatus,
	input: { overdue?: boolean; publishJobStatus?: string | null },
): string {
	if (input.overdue && (ws === 'SCHEDULED' || ws === 'PUBLISHING')) return 'Overdue';
	if (ws === 'FAILED') return 'Failed';
	if (ws === 'PUBLISHED') return 'Published';
	if (ws === 'PUBLISHING') return 'Publishing';
	if (ws === 'SCHEDULED') return 'Scheduled';
	if (ws === 'APPROVED_UNSCHEDULED') return 'Ready To Publish';
	if (ws === 'NEEDS_APPROVAL') return 'Needs Approval';
	if (ws === 'REJECTED') return 'Rejected';
	if (ws === 'DRAFT') return 'Draft';
	if (input.publishJobStatus === 'failed') return 'Failed';
	return ws;
}

export function stageIncludesWorkflowStatus(stage: NativeQueueStage, ws: WorkflowStatus): boolean {
	switch (stage) {
		case 'approval':
			return ['NEEDS_APPROVAL', 'APPROVED_UNSCHEDULED', 'REJECTED'].includes(ws);
		case 'schedule':
			return ['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'APPROVED_UNSCHEDULED'].includes(ws);
		case 'published':
			return ws === 'PUBLISHED';
		default:
			return false;
	}
}

export function mapMemoryToQueueItem(
	brain: BrandBrain,
	memory: ContentMemoryRecord,
	diagnostics: ContentPublishDiagnostics | null,
	extra?: {
		linkedImageUrl?: string | null;
		destinationLabel?: string | null;
		publishJob?: PublishJobRow;
		linkedAssetId?: string | null;
		mediaPath?: string | null;
		mediaSelectionReason?: string | null;
	},
): NativeQueueListItem {
	const ws = workflowStatus(memory);
	const overdue = isScheduledOverdue(memory);
	const metadata = memory.metadata ?? {};
	const imageUrl =
		extra?.linkedImageUrl?.trim() ||
		metadataString(metadata, 'imageReferenceUrl') ||
		metadataString(metadata, 'image_reference_url') ||
		'';
	const body = memory.body ?? '';

	return {
		id: memory.id,
		source: 'native',
		title: memory.hook || memory.topic || 'Untitled draft',
		platform: channelDisplayPlatform(String(memory.channel)),
		channel: String(memory.channel),
		content: body,
		summary: body.slice(0, 280),
		status: uiStatusLabel(ws, { overdue, publishJobStatus: diagnostics?.publishJobStatus }),
		workflowStatus: ws,
		content_type: memory.contentType ? String(memory.contentType) : undefined,
		scheduled_date: displayScheduleAt(memory),
		published_at: memory.publicationStatus === 'published' ? memory.publicationDate ?? null : null,
		created_time: memory.createdAt,
		brand_name: brain.identity.name,
		brand_profile_id: effectiveBrandProfileId(brain),
		destination: extra?.destinationLabel ?? memory.destination ?? null,
		external_url: memory.externalUrl ?? null,
		last_publish_error: diagnostics?.lastPublishError ?? null,
		publish_job_status: diagnostics?.publishJobStatus ?? null,
		is_overdue: overdue,
		publish_schedule_warning: schedulePublishWarning(memory, extra?.publishJob),
		hashtags: metadataString(metadata, 'hashtags'),
		image_prompt: metadataString(metadata, 'image_prompt') || metadataString(metadata, 'imagePrompt'),
		image_reference_url: imageUrl || undefined,
		linked_asset_id: extra?.linkedAssetId ?? metadataString(metadata, 'linkedAssetId'),
		media_path: extra?.mediaPath ?? metadataString(metadata, 'mediaPath'),
		media_selection_reason: extra?.mediaSelectionReason ?? metadataString(metadata, 'mediaSelectionReason'),
		proposedSchedule: proposedScheduleLabelFromMetadata(metadata),
		proposedScheduleKind:
			typeof metadata.proposedScheduleKind === 'string' ? metadata.proposedScheduleKind : undefined,
		proposedScheduleAt:
			typeof metadata.proposedScheduleAt === 'string' ? metadata.proposedScheduleAt : undefined,
		evidence: /source:/i.test(`${body}\n${memory.sourceIdea ?? ''}`),
		airtableContentId: memory.airtableContentId ?? null,
		queue_hold: memoryHeldFromQueue(memory) || undefined,
	};
}

export type ListNativeQueueInput = {
	stage: NativeQueueStage;
	brandProfileId?: string | null;
	platformTab?: string | null;
	contentBriefId?: string | null;
};

export function filterNativeQueueItem(
	item: NativeQueueListItem,
	memory: ContentMemoryRecord,
	input: ListNativeQueueInput,
): boolean {
	if (input.stage === 'approval' && memoryHeldFromQueue(memory)) return false;
	if (input.stage === 'approval' && shouldExcludeFromApprovalStage(memory)) return false;
	if (!stageIncludesWorkflowStatus(input.stage, item.workflowStatus)) return false;
	if (!matchesPlatformTab(String(memory.channel), input.platformTab)) return false;
	if (input.contentBriefId && memory.briefId !== input.contentBriefId) return false;
	return true;
}

export function filterBrainsForBrand(
	brains: BrandBrain[],
	brandProfileId?: string | null,
): BrandBrain[] {
	return brains.filter((brain) => brainMatchesBrandFilter(brain, brandProfileId));
}
