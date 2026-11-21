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
	if (input.accepted > 0 && !input.hasPreview) return { action: 'preview', label: 'Preview selected changes' };
	if (input.accepted > 0 && input.hasPreview) return { action: 'apply', label: 'Apply changes' };
	if (!input.hasCritique || input.reviewStale) return { action: input.hasCritique ? 'rereview' : 'critique', label: 'Review improvements' };
	if (input.blockingOpen === 0) return { action: 'images', label: 'Continue to Images' };
	return { action: 'stay', label: 'Approve edits' };
}

export function acceptanceLabel(status: 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied' | 'manual'): string {
	if (status === 'accepted') return 'Accepted';
	if (status === 'applied') return 'Applied';
	if (status === 'rejected') return 'Rejected';
	if (status === 'deferred') return 'Deferred';
	if (status === 'manual') return 'Needs a manual decision';
	return 'Suggested';
}

export type ProposalDisposition = 'apply' | 'manual' | 'conflict' | 'resolved' | 'open';

/** Acceptance is not an edit. A stale or non-editing instruction is kept out of the rewrite. */
export function proposalDisposition(
	proposal: { status: string; sourceRevisionId?: string | null; section?: string | null; action?: string },
	currentRevisionId: string | null,
	body: string,
): ProposalDisposition {
	if (proposal.status === 'applied' || proposal.status === 'rejected' || proposal.status === 'deferred' || proposal.status === 'manual') return 'resolved';
	if (proposal.status !== 'accepted') return 'open';
	if (/do not add filler|that is acceptable if/i.test(proposal.action ?? '')) return 'manual';
	const section = proposal.section?.trim();
	const sectionMissing = Boolean(section && !body.includes(section));
	const stale = Boolean(proposal.sourceRevisionId && currentRevisionId && proposal.sourceRevisionId !== currentRevisionId);
	if (stale || sectionMissing) return 'conflict';
	return 'apply';
}

export function isSelfOverlap(title: string, evidence: string[]): boolean {
	return evidence.some((item) => title.trim().length > 0 && item.includes(`“${title.trim()}”`) && item.includes('100%'));
}

/** Editorial review is complete only when decisions are resolved on the current draft and nothing blocking remains. */
export function editorialProgress(input: {
	proposals: Array<{ status: string; sourceRevisionId?: string | null; section?: string | null; action?: string }>;
	currentRevisionId: string | null;
	body: string;
	critiqueRevisionId: string | null;
	openCritical: Array<{ code?: string; evidence?: string[]; explanation?: string; revisionId?: string | null }>;
	title: string;
	structureOk: boolean;
}): { complete: boolean; blocker: string | null; next: string; awaitingApplication: number } {
	const dispositions = input.proposals.map((proposal) => proposalDisposition(proposal, input.currentRevisionId, input.body));
	const applyCount = dispositions.filter((item) => item === 'apply').length;
	const conflictCount = dispositions.filter((item) => item === 'conflict').length;
	const openCount = dispositions.filter((item) => item === 'open').length;
	const blocking = input.openCritical.filter((finding) => {
		if (finding.revisionId && input.currentRevisionId && finding.revisionId !== input.currentRevisionId) return false;
		return !(finding.code === 'content_overlap' && isSelfOverlap(input.title, finding.evidence ?? []));
	});
	const critiqueCurrent = Boolean(input.critiqueRevisionId && input.critiqueRevisionId === input.currentRevisionId);
	const parts: string[] = [];
	if (conflictCount) parts.push(`${conflictCount} approved change${conflictCount === 1 ? '' : 's'} cannot be applied because the instruction does not match the current article.`);
	if (applyCount) parts.push(`${applyCount} approved change${applyCount === 1 ? '' : 's'} ${applyCount === 1 ? 'is' : 'are'} not in the draft yet.`);
	if (openCount) parts.push(`${openCount} recommendation${openCount === 1 ? '' : 's'} still need a decision.`);
	if (blocking.length) parts.push(blocking[0]?.explanation || blocking[0]?.evidence?.[0] || 'A blocking finding is still open.');
	if (!input.structureOk) parts.push('The draft failed structure validation.');
	if (!critiqueCurrent && applyCount === 0 && conflictCount === 0 && openCount === 0 && blocking.length === 0 && input.structureOk) {
		parts.push('Editorial review has not been run on this revision.');
	}
	const next = applyCount
		? 'Preview the approved changes, then confirm the new revision. The published baseline stays in revision history.'
		: conflictCount
			? 'Reject the unmatched instruction or rewrite it against a section in the current article.'
			: blocking.length
				? 'Resolve the blocking finding, then run editorial review on the revised draft.'
				: !critiqueCurrent
					? 'Run editorial review on the current draft.'
					: 'Review the exact metadata and article changes, then approve them. Nothing is sent until you do.';
	return { complete: parts.length === 0, blocker: parts.join(' ') || null, next, awaitingApplication: applyCount };
}

export function publicationChanges(input: {
	revisionKind?: string | null;
	revisionSource?: string | null;
	metadataStatus?: string | null;
	currentSeoTitle?: string;
	currentDescription?: string;
	proposedSeoTitle?: string;
	proposedDescription?: string;
	baselineRevision?: number | null;
}): { kind: 'metadata' | 'body' | 'both' | 'none'; detail: string } {
	const metadata = input.metadataStatus === 'pending'
		&& ((input.proposedSeoTitle ?? '') !== (input.currentSeoTitle ?? '') || (input.proposedDescription ?? '') !== (input.currentDescription ?? ''));
	const unchangedBody = input.revisionKind === 'baseline' || input.revisionKind === 'metadata' || input.revisionSource === 'baseline' || input.revisionSource === 'metadata' || input.revisionSource === 'legacy';
	const body = !unchangedBody && Boolean(input.revisionKind || input.revisionSource);
	const kind = metadata && body ? 'both' : metadata ? 'metadata' : body ? 'body' : 'none';
	const baseline = typeof input.baselineRevision === 'number' ? ` Payload baseline revision ${input.baselineRevision}. An update is refused if that revision has changed.` : '';
	const detail = kind === 'both'
		? `Approval covers both the article body and the SEO title and description.${baseline}`
		: kind === 'metadata'
			? `Approval covers the SEO title and description. The article body is the published baseline.${baseline}`
			: kind === 'body'
				? `Approval covers the article body. The SEO title and description are unchanged.${baseline}`
				: `Nothing is waiting to send.${baseline}`;
	return { kind, detail };
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

const LOCKED_CODES = new Set(['unsupported-claim', 'factual_error', 'safety', 'internal_metadata', 'publishing_integrity']);

/** A person can record that a finding does not apply. Safety, factual, and publishing-integrity failures stay open until corrected. */
export function findingMayBeSetAside(input: { code?: string; category?: string; severity?: string; rejectable?: boolean }): boolean {
	if (input.rejectable === false) return false;
	if (input.code && LOCKED_CODES.has(input.code)) return false;
	if (input.severity === 'critical' && (input.category === 'accuracy' || input.category === 'examples' || input.category === 'cms' || input.code === 'content_overlap')) return false;
	return true;
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
