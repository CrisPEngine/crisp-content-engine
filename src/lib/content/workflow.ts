export const WORKFLOW_STATUSES = [
	'DRAFT',
	'NEEDS_APPROVAL',
	'APPROVED_UNSCHEDULED',
	'SCHEDULED',
	'PUBLISHING',
	'PUBLISHED',
	'REJECTED',
	'FAILED',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export function workflowStatus(input: { publicationStatus?: string | null; publicationDate?: string | null }): WorkflowStatus {
	switch (input.publicationStatus) {
		case 'review':
			return 'NEEDS_APPROVAL';
		case 'approved':
			return input.publicationDate ? 'SCHEDULED' : 'APPROVED_UNSCHEDULED';
		case 'scheduled':
			return 'SCHEDULED';
		case 'publishing':
			return 'PUBLISHING';
		case 'published':
			return 'PUBLISHED';
		case 'rejected':
			return 'REJECTED';
		case 'failed':
			return 'FAILED';
		default:
			return 'DRAFT';
	}
}

export type QueueItem = {
	id: string;
	airtableContentId?: string | null;
};

/** Native rows that already have an Airtable copy are hidden so the queue shows one item. */
export function mergeApprovalItems<T extends QueueItem>(airtable: T[], native: T[]): T[] {
	const airtableIds = new Set(airtable.map((item) => item.id));
	const visibleNative = native.filter((item) => !item.airtableContentId || !airtableIds.has(item.airtableContentId));
	return [...airtable, ...visibleNative];
}
