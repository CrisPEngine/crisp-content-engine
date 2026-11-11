'use client';

import { useState } from 'react';
import { DiffView } from '@/components/articles/RevisionDiff';
import type { EditorialBriefState } from '@/lib/articles/editorialBrief';
import type { EditorialDeskState, RevisionProposal } from '@/lib/articles/editorialDesk';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

const STATUS_LABEL: Record<RevisionProposal['status'], string> = {
	proposed: 'Proposed',
	accepted: 'Accepted',
	rejected: 'Rejected',
	deferred: 'Deferred',
	applied: 'Applied',
};

export function EditorialDeskPanel({
	desk,
	brief,
	body,
	exampleNotes,
	busy,
	act,
}: {
	desk: EditorialDeskState | null | undefined;
	brief: EditorialBriefState | null | undefined;
	body: string;
	exampleNotes?: string[];
	busy: boolean;
	act: Act;
}) {
	const [feedback, setFeedback] = useState(desk?.feedback ?? '');
	const [instruction, setInstruction] = useState(brief?.current?.instruction ?? '');
	const critique = desk?.critique;
	const proposals = desk?.proposals ?? [];
	const accepted = proposals.filter((item) => item.status === 'accepted').length;
	const current = brief?.current;
	return (
		<section className="card p-4 space-y-4 text-sm">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="font-medium">Editorial brief</h2>
					<div className="flex flex-wrap gap-2">
						<button className="btn" type="button" disabled={busy} onClick={() => act('generate_editorial_brief', { instruction }, current?.status === 'approved' ? 'New brief version needs approval.' : 'Editorial brief generated.')}>
							Generate editorial brief
						</button>
						<button className="btn" type="button" disabled={busy || !current || current.status === 'approved'} onClick={() => act('approve_editorial_brief', {}, 'Editorial brief approved.')}>
							Approve brief
						</button>
					</div>
				</div>
				<textarea className="input w-full" rows={2} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Optional instruction, for example: make the article more technical." />
				{current ? (
					<div className="space-y-2">
						<p className="text-xs uppercase text-text-soft">Version {current.version} · {current.status.replace(/_/g, ' ')}</p>
						<p><span className="text-text-soft">Title.</span> {current.title}</p>
						<p><span className="text-text-soft">Intent.</span> {current.searchIntent} · {current.primaryKeyword}</p>
						<p><span className="text-text-soft">Brand.</span> {current.brandRelevance}</p>
						<div>
							<p className="text-xs uppercase text-text-soft">Confirmed</p>
							<ul className="list-disc pl-5">{current.confirmed.length ? current.confirmed.map((item) => <li key={item}>{item}</li>) : <li>No confirmed research or verified capabilities yet.</li>}</ul>
						</div>
						<div>
							<p className="text-xs uppercase text-text-soft">Proposed direction</p>
							<ul className="list-disc pl-5">{current.proposed.map((item) => <li key={item}>{item}</li>)}</ul>
						</div>
						{current.sections.map((section) => (
							<div key={section.heading}>
								<p className="font-medium">{section.heading}</p>
								<p className="text-text-soft">{section.proposedDirection}</p>
								{section.confirmedEvidence.length ? <p>Evidence: {section.confirmedEvidence.join(' · ')}</p> : null}
								{section.knowledgeGaps.length ? <p>Knowledge gaps: {section.knowledgeGaps.join(' · ')}</p> : null}
							</div>
						))}
						{current.claimsToVerify.length ? <p>Claims to verify: {current.claimsToVerify.join(' · ')}</p> : null}
						{current.externalCitations.length ? (
							<p className="text-text-soft">
								Citations: {current.externalCitations.filter((item) => item.cite).length} may be cited · {current.externalCitations.filter((item) => !item.cite).length} are background only
							</p>
						) : null}
					</div>
				) : (
					<p className="text-text-soft">The editorial brief is separate from the topic request and the research dossier.</p>
				)}
			</div>
			{(exampleNotes?.length ?? 0) > 0 ? (
				<div>
					<p className="text-xs uppercase text-text-soft">Example consistency</p>
					<ul className="list-disc pl-5">{exampleNotes!.map((item) => <li key={item}>{item}</li>)}</ul>
				</div>
			) : null}
			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge/50 pt-3">
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
							<li key={`${finding.id}-${finding.status}`} className="border-t border-edge/50 pt-2">
								<p className="text-xs uppercase text-text-soft">{finding.status} · {finding.severity} · {finding.category.replace(/_/g, ' ')}{finding.section ? ` · ${finding.section}` : ''}</p>
								<p>{finding.explanation}</p>
								<p className="text-text-soft">{finding.recommendation}</p>
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
						<button className="btn" type="button" disabled={busy || accepted === 0} onClick={() => act('preview_editorial_proposals', {}, 'Preview ready. The article was not changed.')}>
							Preview accepted ({accepted})
						</button>
						<button className="btn" type="button" disabled={busy || !desk?.preview} onClick={() => act('apply_editorial_proposals', {}, 'Accepted changes applied. The article was critiqued again.')}>
							Apply accepted
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
					{desk?.preview ? (
						<div className="space-y-2 border-t border-edge/50 pt-3">
							<p>{desk.preview.summary}</p>
							<p className="text-text-soft">Words {desk.preview.wordCountBefore} → {desk.preview.wordCountAfter}. Rejected and deferred proposals are not in this preview.</p>
							<DiffView before={body} after={desk.preview.proposedBody} />
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
}
