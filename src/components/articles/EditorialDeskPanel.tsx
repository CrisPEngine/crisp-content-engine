'use client';

import { useState } from 'react';
import type { EditorialDeskState, RevisionProposal } from '@/lib/articles/editorialDesk';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

const STATUS_LABEL: Record<RevisionProposal['status'], string> = {
	proposed: 'Proposed',
	accepted: 'Accepted',
	rejected: 'Rejected',
	deferred: 'Deferred',
	applied: 'Applied',
};

export function EditorialDeskPanel({ desk, busy, act }: { desk: EditorialDeskState | null | undefined; busy: boolean; act: Act }) {
	const [feedback, setFeedback] = useState(desk?.feedback ?? '');
	const critique = desk?.critique;
	const proposals = desk?.proposals ?? [];
	const accepted = proposals.filter((item) => item.status === 'accepted').length;
	return (
		<section className="card p-4 space-y-4 text-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="font-medium">Editorial critique</h2>
				<button className="btn" type="button" disabled={busy} onClick={() => act('critique_article', {}, 'Critique saved. The article was not rewritten.')}>
					Critique article
				</button>
			</div>
			{critique ? (
				<div className="space-y-3">
					<p>{critique.overall}</p>
					{critique.strengths.length ? (
						<div>
							<p className="text-xs uppercase text-text-soft">Preserve</p>
							<ul className="list-disc pl-5">{critique.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
						</div>
					) : null}
					<ul className="space-y-3">
						{critique.findings.map((finding) => (
							<li key={finding.id} className="border-t border-edge/50 pt-2">
								<p className="text-xs uppercase text-text-soft">{finding.severity} · {finding.category.replace(/_/g, ' ')}{finding.section ? ` · ${finding.section}` : ''}</p>
								<p>{finding.explanation}</p>
								<p className="text-text-soft">{finding.recommendation}</p>
								<p className="text-xs text-text-soft">Expected: {finding.expectedBenefit}</p>
							</li>
						))}
					</ul>
				</div>
			) : (
				<p className="text-text-soft">Critique reads the current draft and does not change it.</p>
			)}
			<div className="space-y-2 border-t border-edge/50 pt-3">
				<h3 className="font-medium">Give editorial feedback</h3>
				<textarea className="input w-full" rows={5} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Describe what should change. This creates a revision plan. It does not rewrite the article." />
				<button className="btn" type="button" disabled={busy || !feedback.trim()} onClick={() => act('editorial_feedback', { feedback }, 'Revision plan created. Nothing was rewritten.')}>
					Plan revision
				</button>
			</div>
			{proposals.length ? (
				<div className="space-y-3">
					<div className="flex flex-wrap gap-2">
						<button className="btn" type="button" disabled={busy} onClick={async () => {
							for (const item of proposals.filter((proposal) => proposal.status === 'proposed' || proposal.status === 'deferred')) {
								await act('editorial_proposal', { proposalId: item.id, status: 'accepted' });
							}
						}}>Accept all open</button>
						<button className="btn" type="button" disabled={busy || accepted === 0} onClick={() => act('apply_editorial_proposals', {}, 'Accepted changes applied as a new revision.')}>
							Apply accepted ({accepted})
						</button>
					</div>
					<ul className="space-y-3">
						{proposals.map((proposal) => (
							<li key={proposal.id} className="border-t border-edge/50 pt-2 space-y-1">
								<p className="text-xs uppercase text-text-soft">{STATUS_LABEL[proposal.status]} · {proposal.scope}{proposal.section ? ` · ${proposal.section}` : ''}</p>
								<p>{proposal.action}</p>
								<p className="text-xs text-text-soft">{proposal.reason} {proposal.needsResearch ? 'Needs research. ' : ''}{proposal.needsBrandVerification ? 'Needs verified product facts.' : ''}</p>
								{proposal.status !== 'applied' ? (
									<div className="flex flex-wrap gap-2">
										<button className="btn" type="button" disabled={busy} onClick={() => act('editorial_proposal', { proposalId: proposal.id, status: 'accepted' }, 'Proposal accepted.')}>Accept</button>
										<button className="btn" type="button" disabled={busy} onClick={() => act('editorial_proposal', { proposalId: proposal.id, status: 'rejected' }, 'Proposal rejected.')}>Reject</button>
										<button className="btn" type="button" disabled={busy} onClick={() => act('editorial_proposal', { proposalId: proposal.id, status: 'deferred' }, 'Proposal deferred.')}>Defer</button>
									</div>
								) : null}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
