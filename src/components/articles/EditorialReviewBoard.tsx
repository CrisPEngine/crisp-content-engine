'use client';

import { useState } from 'react';
import { DiffView } from '@/components/articles/RevisionDiff';
import type { EditorialCritique, RevisionProposal, RevisionPreview } from '@/lib/articles/editorialDesk';
import { findingGroup, findingTitle } from '@/lib/articles/workspaceNavigation';
import { acceptanceLabel } from '@/lib/articles/reviewWorkflow';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

const GROUPS = ['Blocking', 'Important', 'Suggested improvements'] as const;

export function EditorialReviewBoard({
	critique,
	proposals,
	preview,
	body,
	currentRevision,
	reviewedRevision,
	reviewStale,
	busy,
	act,
}: {
	critique: EditorialCritique | null;
	proposals: RevisionProposal[];
	preview: RevisionPreview | null;
	body: string;
	currentRevision: number | null;
	reviewedRevision: number | null;
	reviewStale: boolean;
	busy: boolean;
	act: Act;
}) {
	const [feedback, setFeedback] = useState('');
	const [editing, setEditing] = useState<string | null>(null);
	const [instruction, setInstruction] = useState('');
	const accepted = proposals.filter((item) => item.status === 'accepted');
	const open = critique?.findings.filter((item) => item.status === 'open').length ?? 0;
	const resolved = critique?.findings.filter((item) => item.status === 'resolved').length ?? 0;
	const blocking = critique?.findings.filter((item) => item.status === 'open' && item.severity === 'critical').length ?? 0;
	return (
		<section className="card mx-auto max-w-3xl space-y-4 p-4 text-sm">
			<div>
				<h2 className="font-medium">Editorial review</h2>
				<p className="text-text-soft">
					Current revision {currentRevision ?? '—'}
					{reviewedRevision ? ` · last reviewed revision ${reviewedRevision}` : ' · not reviewed yet'}
					{` · ${open} open · ${accepted.length} accepted, awaiting application · ${resolved} resolved · ${blocking} blocking`}
				</p>
			</div>
			{reviewStale ? <p className="text-warning">Review is outdated. Run review against the current revision.</p> : null}
			{accepted.length ? (
				<p className="rounded border border-primary/40 bg-primary/10 p-3">
					{accepted.length} change{accepted.length === 1 ? '' : 's'} accepted. The article has not changed yet.
				</p>
			) : null}
			{critique ? (
				<div className="space-y-2">
					<p>{critique.overall}</p>
					{critique.strengths.length ? <p className="text-text-soft">Preserve: {critique.strengths.join(' · ')}</p> : null}
				</div>
			) : <p className="text-text-soft">Critique reads the draft and does not change it.</p>}
			{GROUPS.map((group) => {
				const items = (critique?.findings ?? []).filter((finding) => findingGroup(finding.severity) === group && finding.status !== 'resolved');
				if (!items.length) return null;
				return (
					<div key={group}>
						<h3 className="font-medium">{group}</h3>
						<ul className="space-y-3">
							{items.map((finding) => (
								<li key={finding.id} className="border-t border-edge/50 pt-2">
									<p className="font-medium">{findingTitle(finding.category)}</p>
									<p className="text-text-soft">{finding.section ? `Section: ${finding.section}. ` : ''}{finding.explanation}</p>
									<p>{finding.recommendation}</p>
									<p className="text-xs text-text-dim">Why it matters: {finding.expectedBenefit}</p>
								</li>
							))}
						</ul>
					</div>
				);
			})}
			<div className="space-y-2 border-t border-edge/50 pt-3">
				<h3 className="font-medium">What would you like to improve?</h3>
				<textarea className="input w-full" rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Strengthen the introduction. Name a section to limit the change." />
				<button className="btn" type="button" disabled={busy || !feedback.trim()} onClick={() => void act('editorial_feedback', { feedback }, 'Revision plan created. The article was not changed.')}>Plan revision</button>
			</div>
			{proposals.length ? (
				<ul className="space-y-3">
					{proposals.map((proposal) => (
						<li key={proposal.id} className="border-t border-edge/50 pt-2">
							<p className="text-xs uppercase text-text-dim">{acceptanceLabel(proposal.status)}{proposal.section ? ` · ${proposal.section}` : ''}</p>
							{editing === proposal.id ? (
								<textarea className="input mt-1 w-full" rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} />
							) : <p>{proposal.action}</p>}
							<p className="text-text-soft">{proposal.reason}</p>
							{proposal.status !== 'applied' ? (
								<div className="mt-2 flex flex-wrap gap-2">
									<button className="btn" type="button" disabled={busy} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: 'accepted' }, 'Accepted. The article has not changed.')}>Accept</button>
									<button className="btn" type="button" disabled={busy} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: 'rejected' }, 'Proposal rejected.')}>Reject</button>
									<button className="btn" type="button" disabled={busy} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: 'deferred' }, 'Proposal deferred.')}>Defer</button>
									{editing === proposal.id ? (
										<button className="btn" type="button" disabled={busy || !instruction.trim()} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: proposal.status === 'proposed' ? 'accepted' : proposal.status, instruction }, 'Instruction saved.')}>Save instruction</button>
									) : (
										<button className="btn" type="button" onClick={() => { setEditing(proposal.id); setInstruction(proposal.action); }}>Edit instruction</button>
									)}
								</div>
							) : null}
						</li>
					))}
				</ul>
			) : null}
			{preview ? (
				<div className="space-y-2 border-t border-edge/50 pt-3">
					<p className="font-medium">Preview only. Nothing has been applied.</p>
					<p>{preview.summary}</p>
					<p className="text-text-soft">Words {preview.wordCountBefore} → {preview.wordCountAfter}. Rejected and deferred proposals are excluded.</p>
					<DiffView before={body} after={preview.proposedBody} />
				</div>
			) : null}
		</section>
	);
}
