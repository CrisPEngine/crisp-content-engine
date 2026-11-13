export type ReviewPrimary =
	| { action: 'critique'; label: string }
	| { action: 'rereview'; label: string }
	| { action: 'preview'; label: string }
	| { action: 'apply'; label: string }
	| { action: 'draft'; label: string }
	| { action: 'images'; label: string }
	| { action: 'stay'; label: string };

/** One next step for the editorial review stage. Acceptance never counts as an applied draft change. */
export function reviewPrimary(input: {
	hasCritique: boolean;
	reviewStale: boolean;
	accepted: number;
	hasPreview: boolean;
	justApplied: boolean;
	blockingOpen: number;
}): ReviewPrimary {
	if (input.justApplied) return { action: 'draft', label: 'Review changes' };
	if (!input.hasCritique || input.reviewStale) return { action: input.hasCritique ? 'rereview' : 'critique', label: 'Run Editorial Pass of Draft' };
	if (input.accepted > 0 && !input.hasPreview) {
		return { action: 'preview', label: 'Apply Suggested Edits to Draft' };
	}
	if (input.accepted > 0 && input.hasPreview) {
		return { action: 'apply', label: 'Confirm and save these edits' };
	}
	if (input.blockingOpen === 0) return { action: 'images', label: 'Continue to Images' };
	return { action: 'stay', label: 'Approve edits' };
}

export function acceptanceLabel(status: 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied'): string {
	if (status === 'accepted') return 'Approved. The draft has not changed.';
	if (status === 'applied') return 'Applied to the draft';
	if (status === 'rejected') return 'Rejected';
	if (status === 'deferred') return 'Deferred';
	return 'Suggested';
}
