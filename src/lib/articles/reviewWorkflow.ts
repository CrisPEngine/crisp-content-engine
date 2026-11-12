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
	if (input.justApplied) return { action: 'draft', label: 'View updated draft' };
	if (!input.hasCritique) return { action: 'critique', label: 'Critique article' };
	if (input.accepted > 0 && !input.hasPreview) {
		return { action: 'preview', label: `Preview and apply ${input.accepted} change${input.accepted === 1 ? '' : 's'}` };
	}
	if (input.accepted > 0 && input.hasPreview) {
		return { action: 'apply', label: `Apply ${input.accepted} accepted change${input.accepted === 1 ? '' : 's'}` };
	}
	if (input.reviewStale) return { action: 'rereview', label: 'Re-run review' };
	if (input.blockingOpen === 0) return { action: 'images', label: 'Continue to Images' };
	return { action: 'stay', label: 'Review findings' };
}

export function acceptanceLabel(status: 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied'): string {
	if (status === 'accepted') return 'Accepted, awaiting application';
	if (status === 'applied') return 'Applied to the draft';
	if (status === 'rejected') return 'Rejected';
	if (status === 'deferred') return 'Deferred';
	return 'Suggested';
}
