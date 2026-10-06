export type ApprovalDecision = 'approve' | 'reject';

export function approvalSubmitLabel(decision: ApprovalDecision, schedule: boolean): string {
	if (decision === 'reject') return 'Reject';
	return schedule ? 'Approve and schedule' : 'Approve';
}

export function approvalPendingLabel(decision: ApprovalDecision, schedule: boolean): string {
	if (decision === 'reject') return 'Rejecting…';
	return schedule ? 'Approving and scheduling…' : 'Approving…';
}

export function approvalSuccessHeadline(decision: string, schedule: boolean): string {
	if (decision === 'reject') return 'Request rejected';
	if (schedule) return 'Approved and scheduled';
	return 'Approved';
}

export function approvalSuccessDetail(decision: string): string {
	if (decision === 'reject') {
		return 'Your decision was recorded. The draft will not be published or scheduled.';
	}
	return 'Your decision was recorded. You can close this page.';
}
