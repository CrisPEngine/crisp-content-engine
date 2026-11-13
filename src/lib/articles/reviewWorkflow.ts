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
		const count = input.accepted;
		return { action: 'preview', label: `Apply ${count} Approved Edit${count === 1 ? '' : 's'} to Draft` };
	}
	if (input.accepted > 0 && input.hasPreview) {
		return { action: 'apply', label: 'Confirm and save these edits' };
	}
	if (input.blockingOpen === 0) return { action: 'images', label: 'Continue to Images' };
	return { action: 'stay', label: 'Approve edits' };
}

export function acceptanceLabel(status: 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied'): string {
	if (status === 'accepted') return 'Approved, awaiting application';
	if (status === 'applied') return 'Applied to the draft';
	if (status === 'rejected') return 'Rejected, excluded from revision';
	if (status === 'deferred') return 'Deferred';
	return 'Pending review';
}

export type FindingLifecycle = 'pending' | 'approved' | 'rejected' | 'deferred' | 'applied-unresolved' | 'resolved' | 'stale';

/** One visible state for a finding. An applied finding is not shown as a new pending item. */
export function findingLifecycle(input: {
	stale: boolean;
	findingStatus: string;
	proposalStatus?: string | null;
}): FindingLifecycle {
	if (input.proposalStatus === 'rejected' || input.findingStatus === 'rejected') return 'rejected';
	if (input.proposalStatus === 'deferred' || input.findingStatus === 'deferred') return 'deferred';
	if (input.proposalStatus === 'accepted') return input.stale ? 'stale' : 'approved';
	if (input.proposalStatus === 'applied' && input.findingStatus === 'resolved') return 'resolved';
	if (input.proposalStatus === 'applied') return 'applied-unresolved';
	if (input.findingStatus === 'resolved') return 'resolved';
	if (input.stale) return 'stale';
	return 'pending';
}

export function lifecycleLabel(state: FindingLifecycle, revision?: number | null): string {
	if (state === 'pending') return 'Pending review';
	if (state === 'approved') return 'Approved, awaiting application';
	if (state === 'rejected') return 'Rejected, excluded from revision';
	if (state === 'deferred') return 'Deferred. Excluded from this revision.';
	if (state === 'applied-unresolved') return revision ? `Applied in Revision ${revision}. Issue still detected.` : 'Applied in an earlier revision. Issue still detected.';
	if (state === 'resolved') return revision ? `Applied in Revision ${revision}. Verified resolved.` : 'No longer detected on this pass.';
	return 'Stale. Run the editorial pass again before applying.';
}
