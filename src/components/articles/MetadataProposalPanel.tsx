'use client';

import { parseMetadataProposal } from '@/lib/campaigns/optimisation';

export function MetadataProposalPanel({ body, pending, canonicalUrl, onAction }: {
	body: string;
	pending: boolean;
	canonicalUrl?: string | null;
	onAction: (action: 'approve' | 'reject_proposal' | 'request_proposal_changes') => void;
}) {
	const proposal = parseMetadataProposal(body);
	if (!proposal) return null;
	return (
		<section className="card mb-4 space-y-3 p-4 text-sm">
			<h2 className="font-medium">Metadata proposal</h2>
			<p className="text-text-soft">This is a title and description proposal, not the article. Approving it does not publish it and does not change the live page.{canonicalUrl ? ` Linked to ${canonicalUrl}.` : ''}</p>
			<div className="grid gap-3 md:grid-cols-2">
				<div>
					<p className="text-text-dim">Original title</p>
					<p>{proposal.originalTitle || 'Not recorded'}</p>
					<p className="mt-2 text-text-dim">Original description</p>
					<p>{proposal.originalDescription || 'Not recorded'}</p>
				</div>
				<div>
					<p className="text-text-dim">Proposed title</p>
					<p>{proposal.proposedTitle}</p>
					<p className="mt-2 text-text-dim">Proposed description</p>
					<p>{proposal.proposedDescription}</p>
				</div>
			</div>
			<p><span className="text-text-dim">Evidence. </span>{proposal.evidence}</p>
			<p className="whitespace-pre-wrap"><span className="text-text-dim">Why. </span>{proposal.rationale}</p>
			<div className="flex flex-wrap gap-2">
				<button className="btn border-primary bg-primary/15" type="button" disabled={pending} onClick={() => onAction('approve')}>{pending ? 'Saving…' : 'Approve proposal'}</button>
				<button className="btn" type="button" disabled={pending} onClick={() => onAction('request_proposal_changes')}>Request changes</button>
				<button className="btn" type="button" disabled={pending} onClick={() => onAction('reject_proposal')}>Reject proposal</button>
			</div>
		</section>
	);
}
