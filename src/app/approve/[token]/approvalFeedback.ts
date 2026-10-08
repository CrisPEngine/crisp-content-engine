export type ApprovalDecision = 'approve' | 'reject';

export type ApprovalUiMode = 'content' | 'schedule' | 'threads_reply';

export function approvalSubmitLabel(decision: ApprovalDecision, mode: ApprovalUiMode): string {
	if (decision === 'reject') return 'Reject';
	if (mode === 'schedule') return 'Approve and schedule';
	if (mode === 'threads_reply') return 'Approve & post';
	return 'Approve';
}

export function approvalPendingLabel(decision: ApprovalDecision, mode: ApprovalUiMode): string {
	if (decision === 'reject') return 'Rejecting…';
	if (mode === 'schedule') return 'Approving and scheduling…';
	if (mode === 'threads_reply') return 'Posting reply…';
	return 'Approving…';
}

export function approvalSuccessHeadline(decision: string, mode: ApprovalUiMode): string {
	if (decision === 'reject') return 'Request rejected';
	if (mode === 'schedule') return 'Approved and scheduled';
	if (mode === 'threads_reply') return 'Reply posted';
	return 'Approved';
}

export function approvalSuccessDetail(decision: string, mode: ApprovalUiMode, publishError?: string | null): string {
	if (decision === 'reject') {
		return 'Your decision was recorded. The draft will not be published or scheduled.';
	}
	if (publishError) {
		return publishError;
	}
	if (mode === 'threads_reply') {
		return 'Your reply was sent via the Threads API.';
	}
	return 'Your decision was recorded. You can close this page.';
}
