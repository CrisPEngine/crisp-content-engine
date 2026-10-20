import { describe, expect, it } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import {
	applyNativeQueueSchedulePatch,
	finalizeApprovalSchedule,
	needsApprovedScheduleRepair,
	repairApprovedScheduleMemory,
	resolveNativeQueueScheduleIntent,
	shouldExcludeFromApprovalStage,
} from '@/lib/content/nativeQueueSchedule';
import { mapMemoryToQueueItem, stageIncludesWorkflowStatus } from '@/lib/content/nativeQueueView';
import { workflowStatus } from '@/lib/content/workflow';
import type { BrandBrain } from '@/lib/intelligence/types';

const brain: BrandBrain = {
	id: 'brain-1',
	userId: 'user-1',
	airtableBrandId: '',
	identity: { name: 'Folian' },
	voice: {},
	guardrails: {},
	knowledge: {},
	examples: [],
	updatedAt: '',
};

function reviewMemory(overrides: Partial<ContentMemoryRecord> = {}): ContentMemoryRecord {
	return {
		id: 'mem-ig-1',
		userId: 'user-1',
		brandBrainId: brain.id,
		channel: 'instagram',
		body: 'Caption',
		publicationStatus: 'review',
		createdAt: '2026-10-19T12:00:00.000Z',
		...overrides,
	};
}

describe('nativeQueueSchedule', () => {
	it('stores pre-approval times as preference metadata without scheduling', () => {
		const memory = reviewMemory();
		const patch = applyNativeQueueSchedulePatch({
			memory,
			scheduledTime: '2026-10-20T09:00:00.000Z',
			scheduleIntent: 'preference',
		});
		expect(patch.publicationStatus).toBe('review');
		expect(patch.publicationDate).toBeUndefined();
		expect(patch.metadata.proposedScheduleAt).toBe('2026-10-20T09:00:00.000Z');
		expect(patch.shouldSyncPublishJob).toBe(false);
	});

	it('does not publish when saving a proposed schedule preference', () => {
		const memory = reviewMemory();
		const patch = applyNativeQueueSchedulePatch({
			memory,
			scheduledTime: '2026-10-21T11:00:00.000Z',
			scheduleIntent: 'preference',
		});
		expect(patch.publicationStatus).not.toBe('scheduled');
		expect(patch.publishAt).toBeUndefined();
	});

	it('finalizes schedule on approve when a preference was saved', () => {
		const memory = reviewMemory({
			metadata: { proposedScheduleAt: '2026-10-20T09:00:00.000Z', proposedSchedule: 'Mon 20 Oct' },
		});
		const finalized = finalizeApprovalSchedule(memory);
		expect(finalized.scheduled).toBe(true);
		expect(finalized.publicationStatus).toBe('scheduled');
		expect(finalized.publicationDate).toBe('2026-10-20T09:00:00.000Z');
		expect(finalized.metadata.proposedScheduleAt).toBeUndefined();

		const ws = workflowStatus({
			publicationStatus: finalized.publicationStatus,
			publicationDate: finalized.publicationDate,
		});
		expect(ws).toBe('SCHEDULED');
		expect(stageIncludesWorkflowStatus('approval', ws)).toBe(false);
		expect(stageIncludesWorkflowStatus('schedule', ws)).toBe(true);
	});

	it('keeps approve-without-schedule as approved unscheduled', () => {
		const memory = reviewMemory();
		const finalized = finalizeApprovalSchedule(memory);
		expect(finalized.scheduled).toBe(false);
		expect(finalized.publicationStatus).toBe('approved');
		expect(workflowStatus({ publicationStatus: 'approved' })).toBe('APPROVED_UNSCHEDULED');
		expect(stageIncludesWorkflowStatus('approval', 'APPROVED_UNSCHEDULED')).toBe(true);
	});

	it('surfaces pending preference times in queue scheduled_date before approval', () => {
		const memory = reviewMemory({
			metadata: { proposedScheduleAt: '2026-10-22T08:00:00.000Z' },
		});
		const item = mapMemoryToQueueItem(brain, memory, null, { destinationLabel: '@folian.app' });
		expect(item.scheduled_date).toBe('2026-10-22T08:00:00.000Z');
		expect(item.destination).toBe('@folian.app');
	});

	it('repairs already-approved rows that still carry proposedScheduleAt', () => {
		const stuck = reviewMemory({
			publicationStatus: 'approved',
			metadata: { proposedScheduleAt: '2026-10-20T15:30:00.000Z' },
		});
		expect(needsApprovedScheduleRepair(stuck)).toBe(true);
		const repaired = repairApprovedScheduleMemory(stuck);
		expect(repaired.publicationStatus).toBe('scheduled');
		expect(repaired.publicationDate).toBe('2026-10-20T15:30:00.000Z');
		expect(repaired.metadata?.proposedScheduleAt).toBeUndefined();
	});

	it('schedules immediately when publish intent is used on approved content', () => {
		const memory = reviewMemory({ publicationStatus: 'approved' });
		const patch = applyNativeQueueSchedulePatch({
			memory,
			scheduledTime: '2026-10-23T10:00:00.000Z',
			scheduleIntent: 'publish',
		});
		expect(patch.publicationStatus).toBe('scheduled');
		expect(patch.shouldSyncPublishJob).toBe(true);
	});

	it('repairs approved rows that already have publicationDate but stayed approved', () => {
		const stuck = reviewMemory({
			publicationStatus: 'approved',
			publicationDate: '2026-10-24T08:45:00.000Z',
		});
		expect(needsApprovedScheduleRepair(stuck)).toBe(true);
		const repaired = repairApprovedScheduleMemory(stuck);
		expect(repaired.publicationStatus).toBe('scheduled');
		expect(repaired.publicationDate).toBe('2026-10-24T08:45:00.000Z');
		expect(shouldExcludeFromApprovalStage(repaired)).toBe(true);
	});

	it('defaults schedule intent to publish after approval', () => {
		expect(resolveNativeQueueScheduleIntent({ publicationStatus: 'approved' })).toBe('publish');
		expect(resolveNativeQueueScheduleIntent({ publicationStatus: 'scheduled' })).toBe('publish');
		expect(resolveNativeQueueScheduleIntent({ publicationStatus: 'review' })).toBe('preference');
	});

	it('excludes approved rows with pending schedule from approval stage', () => {
		const memory = reviewMemory({
			publicationStatus: 'approved',
			metadata: { proposedScheduleAt: '2026-10-25T08:47:00.000Z' },
		});
		expect(shouldExcludeFromApprovalStage(memory)).toBe(true);
		const reviewWithProposal = reviewMemory({
			metadata: { proposedScheduleAt: '2026-10-25T08:47:00.000Z' },
		});
		expect(shouldExcludeFromApprovalStage(reviewWithProposal)).toBe(false);
	});
});
