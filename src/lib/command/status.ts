/** Human labels for production job records. These do not invent a status the record does not have. */
export function workflowStatusLabel(status: string): string {
	switch (status) {
		case 'queued':
			return 'Queued';
		case 'running':
			return 'Running';
		case 'needs_attention':
			return 'Needs attention';
		case 'ready_for_approval':
			return 'Waiting for approval';
		case 'failed':
			return 'Failed';
		case 'completed':
			return 'Completed';
		default:
			return status.replaceAll('_', ' ');
	}
}

export function workflowStageLabel(stage: string): string {
	switch (stage) {
		case 'research':
			return 'Research';
		case 'brief':
			return 'Planning';
		case 'draft':
			return 'Draft';
		case 'corrections':
			return 'Editorial';
		case 'approval':
			return 'Approval';
		case 'metadata':
			return 'Search metadata';
		default:
			return stage.replaceAll('_', ' ');
	}
}

/** Present a stored job note without leading with raw finding codes or record ids. */
export function presentWorkflowNote(note: string): string {
	return note
		.replaceAll('intro-weak', 'a weak introduction')
		.replaceAll('cta-weak', 'a weak call to action')
		.replace(/\b[0-9a-f]{8}-[0-9a-f-]{20,}\b/gi, 'the article');
}

export function activityProcess(detail: string): string {
	if (/published in the cms/i.test(detail)) return 'Publication record';
	if (/metadata/i.test(detail)) return 'Search preparation';
	if (/local changes/i.test(detail)) return 'Editorial workspace';
	if (/review/i.test(detail)) return 'Editorial review';
	return 'Content workflow';
}
