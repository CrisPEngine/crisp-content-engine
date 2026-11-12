'use client';

import { useState } from 'react';
import { DiffView } from '@/components/articles/RevisionDiff';
import type { EditorialCritique, RevisionProposal, RevisionPreview } from '@/lib/articles/editorialDesk';
import type { ArticleEditorialFinding } from '@/lib/articles/types';
import { findingGroup, findingTitle } from '@/lib/articles/workspaceNavigation';
import { acceptanceLabel } from '@/lib/articles/reviewWorkflow';
import { consolidateFindings, sourceLabel, type UnifiedFinding } from '@/lib/articles/unifiedFindings';

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
	validationFindings,
	currentRevisionId,
	onResearch,
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
	validationFindings: ArticleEditorialFinding[];
	currentRevisionId: string | null;
	onResearch: () => void;
}) {
	const [feedback, setFeedback] = useState('');
	const [editing, setEditing] = useState<string | null>(null);
	const [instruction, setInstruction] = useState('');
	const accepted = proposals.filter((item) => item.status === 'accepted');
	const open = critique?.findings.filter((item) => item.status === 'open').length ?? 0;
	const resolved = critique?.findings.filter((item) => item.status === 'resolved').length ?? 0;
	const blocking = critique?.findings.filter((item) => item.status === 'open' && item.severity === 'critical').length ?? 0;
	const critiqueStale = Boolean(critique?.revisionId && currentRevisionId && critique.revisionId !== currentRevisionId);
	const unified = consolidateFindings([
		...(critique?.findings ?? []).filter((item) => item.status !== 'resolved').map((item): UnifiedFinding => ({
			id: item.id,
			title: findingTitle(item.category),
			severity: item.severity,
			source: sourceLabel('critique', item.category),
			section: item.section,
			explanation: item.explanation,
			evidence: item.evidence,
			correction: item.recommendation,
			status: proposals.find((proposal) => proposal.sourceFindingId === item.id)?.status ?? item.status,
			stale: critiqueStale,
		})),
		...validationFindings.filter((item) => item.decision !== 'applied' && item.decision !== 'superseded').map((item): UnifiedFinding => ({
			id: item.id,
			title: item.code.replace(/_/g, ' '),
			severity: item.severity,
			source: sourceLabel(item.source, item.dimension),
			section: item.section ?? null,
			explanation: item.explanation || item.instruction,
			evidence: item.evidence ?? [],
			correction: item.editedInstruction || item.proposedFix || item.instruction,
			status: proposals.find((proposal) => proposal.sourceFindingId === item.id)?.status ?? item.decision,
			stale: Boolean(item.revisionId && currentRevisionId && item.revisionId !== currentRevisionId),
		})),
	]);
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
			{reviewStale || unified.some((item) => item.stale) ? (
				<div className="space-y-2">
					<p className="text-warning">Review is outdated. Findings tied to an older revision cannot be applied until they are checked again.</p>
					<button className="btn" type="button" disabled={busy} onClick={() => void act('critique_article', {}, 'Critique saved against the current revision. The article was not rewritten.')}>Review current revision</button>
				</div>
			) : null}
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
				const items = unified.filter((item) => findingGroup(item.severity) === group);
				if (!items.length) return null;
				return (
					<div key={group}>
						<h3 className="font-medium">{group}</h3>
						<ul className="space-y-3">
							{items.map((item) => (
								<li key={item.id} className="border-t border-edge/50 pt-2">
									<p className="font-medium">{item.title}</p>
									<p className="text-xs uppercase text-text-dim">{item.source}{item.section ? ` · ${item.section}` : ''} · {item.status}{item.stale ? ' · stale' : ''}</p>
									<p>{item.explanation}</p>
									{item.evidence.length ? <p className="text-text-soft">Evidence: {item.evidence.slice(0, 3).join(' · ')}</p> : null}
									<p>{item.correction}</p>
									<button
										className="btn mt-2"
										type="button"
										disabled={busy || item.stale || item.status === 'accepted' || item.status === 'applied'}
										onClick={() => void act('queue_editorial_change', { findingId: item.id, instruction: item.correction, reason: item.explanation, section: item.section }, 'Added to the revision plan. The article has not changed.')}
									>
										{item.status === 'accepted' ? 'In the revision plan' : 'Accept into revision plan'}
									</button>
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
							{proposal.needsResearch ? <button className="btn" type="button" onClick={onResearch}>Review research for this gap</button> : null}
							{proposal.needsBrandVerification ? <a className="btn" href="/intelligence">Verify the product capability</a> : null}
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
