import type { ContentMemoryRecord } from '@/lib/intelligence/types';

export type ScheduleIntent = 'preference' | 'publish';

export function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = metadata?.[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isAwaitingHumanApproval(publicationStatus: string | undefined): boolean {
	return publicationStatus === 'review' || publicationStatus === 'draft' || publicationStatus === 'idea';
}

/** Chosen publish time stored before approval (metadata) or after scheduling (publicationDate). */
export function pendingScheduleAt(memory: Pick<ContentMemoryRecord, 'publicationDate' | 'metadata'>): string | undefined {
	return memory.publicationDate ?? metadataString(memory.metadata, 'proposedScheduleAt');
}

export function displayScheduleAt(memory: ContentMemoryRecord): string | null {
	const at = pendingScheduleAt(memory);
	return at ?? null;
}

export type FinalizedApprovalSchedule = {
	publicationStatus: ContentMemoryRecord['publicationStatus'];
	publicationDate: string | undefined;
	metadata: Record<string, unknown>;
	publishAt: string | undefined;
	scheduled: boolean;
};

/** On approve, promote a pre-approval schedule preference into a real scheduled publish time. */
export function finalizeApprovalSchedule(memory: ContentMemoryRecord): FinalizedApprovalSchedule {
	const metadata = { ...(memory.metadata ?? {}) };
	const proposedAt = metadataString(metadata, 'proposedScheduleAt');

	if (proposedAt) {
		delete metadata.proposedScheduleAt;
		delete metadata.proposedScheduleLabel;
		delete metadata.proposedSchedule;
		delete metadata.userAcceptedProposedSchedule;
		return {
			publicationStatus: 'scheduled',
			publicationDate: proposedAt,
			metadata,
			publishAt: proposedAt,
			scheduled: true,
		};
	}

	if (memory.publicationDate) {
		return {
			publicationStatus: 'scheduled',
			publicationDate: memory.publicationDate,
			metadata,
			publishAt: memory.publicationDate,
			scheduled: true,
		};
	}

	return {
		publicationStatus: 'approved',
		publicationDate: undefined,
		metadata,
		publishAt: undefined,
		scheduled: false,
	};
}

export type PatchScheduleInput = {
	memory: ContentMemoryRecord;
	scheduledTime: string | null | undefined;
	scheduleIntent: ScheduleIntent;
};

export type PatchScheduleResult = {
	publicationDate: string | undefined;
	publicationStatus: ContentMemoryRecord['publicationStatus'];
	metadata: Record<string, unknown>;
	publishAt: string | undefined;
	shouldSyncPublishJob: boolean;
};

export function applyNativeQueueSchedulePatch(input: PatchScheduleInput): PatchScheduleResult {
	const { memory, scheduledTime, scheduleIntent } = input;
	const metadata = { ...(memory.metadata ?? {}) };
	let publicationDate = memory.publicationDate;
	let publicationStatus = memory.publicationStatus;
	let publishAt: string | undefined;
	let shouldSyncPublishJob = false;

	if (scheduledTime === undefined) {
		return {
			publicationDate,
			publicationStatus,
			metadata,
			publishAt,
			shouldSyncPublishJob,
		};
	}

	if (scheduledTime === null || scheduledTime === '') {
		delete metadata.proposedScheduleAt;
		delete metadata.proposedScheduleLabel;
		delete metadata.proposedSchedule;
		delete metadata.userAcceptedProposedSchedule;
		publicationDate = undefined;
		if (publicationStatus === 'scheduled' && scheduleIntent === 'publish') {
			publicationStatus = 'approved';
		}
		return {
			publicationDate,
			publicationStatus,
			metadata,
			publishAt,
			shouldSyncPublishJob,
		};
	}

	if (scheduleIntent === 'publish' || !isAwaitingHumanApproval(publicationStatus)) {
		publicationDate = scheduledTime;
		publicationStatus = 'scheduled';
		publishAt = scheduledTime;
		shouldSyncPublishJob = true;
		delete metadata.proposedScheduleAt;
		delete metadata.proposedScheduleLabel;
		delete metadata.proposedSchedule;
		delete metadata.userAcceptedProposedSchedule;
	} else {
		metadata.proposedScheduleAt = scheduledTime;
		metadata.userAcceptedProposedSchedule = true;
	}

	return {
		publicationDate,
		publicationStatus,
		metadata,
		publishAt,
		shouldSyncPublishJob,
	};
}

/** Repair rows approved before the schedule-on-approve fix shipped. */
export function needsApprovedScheduleRepair(memory: ContentMemoryRecord): boolean {
	if (memory.publicationStatus !== 'approved') return false;
	if (memory.publicationDate) return false;
	return Boolean(metadataString(memory.metadata, 'proposedScheduleAt'));
}

export function repairApprovedScheduleMemory(memory: ContentMemoryRecord): ContentMemoryRecord {
	if (!needsApprovedScheduleRepair(memory)) return memory;
	const finalized = finalizeApprovalSchedule(memory);
	return {
		...memory,
		publicationStatus: finalized.publicationStatus,
		publicationDate: finalized.publicationDate,
		metadata: finalized.metadata,
	};
}
