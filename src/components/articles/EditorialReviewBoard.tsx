'use client';

import { useState } from 'react';
import { DiffView } from '@/components/articles/RevisionDiff';
import type { EditorialCritique, RevisionProposal, RevisionPreview } from '@/lib/articles/editorialDesk';
import type { ArticleEditorialFinding } from '@/lib/articles/types';
import { findingGroup, findingTitle } from '@/lib/articles/workspaceNavigation';
import { findingLifecycle, findingMayBeSetAside, lifecycleLabel, type FindingLifecycle } from '@/lib/articles/reviewWorkflow';
import { consolidateFindings, sourceLabel, type UnifiedFinding } from '@/lib/articles/unifiedFindings';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

const GROUPS = ['Blocking', 'Important', 'Suggested improvements'] as const;

export function EditorialReviewBoard({
	critique,
	proposals,
	preview,
	body,
	currentRevision,
	reviewStale,
	busy,
	pending,
	act,
	onPreview,
	onConfirm,
	onCancelPreview,
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
	pending?: string;
	act: Act;
	onPreview?: () => void;
	onConfirm?: () => void;
	onCancelPreview?: () => void;
	validationFindings: ArticleEditorialFinding[];
	currentRevisionId: string | null;
	onResearch: () => void;
}) {
	const [feedback, setFeedback] = useState('');
	const [instructions, setInstructions] = useState<Record<string, string>>({});
	const [extraEdits, setExtraEdits] = useState<Record<string, string>>({});
	const critiqueStale = Boolean(critique?.revisionId && currentRevisionId && critique.revisionId !== currentRevisionId);
	const proposalFor = (findingId: string) =>
		proposals.find((item) => item.sourceFindingId === findingId && item.status !== 'applied')
		?? proposals.find((item) => item.sourceFindingId === findingId);
	const unified = consolidateFindings([
		...(critique?.findings ?? []).map((item): UnifiedFinding => {
			const proposal = proposalFor(item.id);
			return {
				id: item.id,
				title: findingTitle(item.category),
				severity: item.severity,
				source: sourceLabel('critique', item.category),
				section: item.section,
				explanation: item.explanation,
				evidence: item.evidence,
				correction: proposal?.action || item.recommendation,
				status: proposal?.status ?? item.status,
				stale: critiqueStale,
				historyNote: item.historyNote,
				appliedRevisionNumber: proposal?.appliedRevisionNumber ?? null,
				dismissible: findingMayBeSetAside({ category: item.category, severity: item.severity }),
			};
		}),
		...validationFindings.filter((item) => item.decision !== 'superseded').map((item): UnifiedFinding => {
			const proposal = proposalFor(item.id);
			return {
				id: item.id,
				title: item.code.replace(/_/g, ' '),
				severity: item.severity,
				source: sourceLabel(item.source, item.dimension),
				section: item.section ?? null,
				explanation: item.explanation || item.instruction,
				evidence: item.evidence ?? [],
				correction: proposal?.action || item.editedInstruction || item.proposedFix || item.instruction,
				status: proposal?.status ?? item.decision,
				stale: Boolean(item.revisionId && currentRevisionId && item.revisionId !== currentRevisionId),
				appliedRevisionNumber: proposal?.appliedRevisionNumber ?? null,
				dismissible: findingMayBeSetAside({ code: item.code, category: item.dimension === 'accuracy' ? 'accuracy' : undefined, severity: item.severity, rejectable: item.rejectable }),
			};
		}),
	]);
	const cards = unified.map((item) => {
		const proposal = proposalFor(item.id);
		const state = findingLifecycle({ stale: item.stale, findingStatus: item.status, proposalStatus: proposal?.status });
		return { item, proposal, state };
	});
	const actionable = cards.filter((card) => card.state === 'pending' || card.state === 'stale');
	const approved = cards.filter((card) => card.state === 'approved');
	const applied = cards.filter((card) => card.state === 'applied-unresolved' || card.state === 'resolved');
	const held = cards.filter((card) => card.state === 'rejected' || card.state === 'deferred');
	const identified = cards.filter((card) => card.state !== 'resolved').length;

	function instructionFor(card: { item: UnifiedFinding; proposal?: RevisionProposal }) {
		return instructions[card.item.id] ?? card.proposal?.action ?? card.item.correction;
	}
	function setAside(card: { item: UnifiedFinding; proposal?: RevisionProposal }, reason: string) {
		void act('queue_editorial_change', {
			findingId: card.item.id,
			instruction: instructionFor(card),
			reason,
			section: card.item.section,
			status: 'rejected',
			resolutionNote: `Not applicable: ${reason}`,
		}, 'Marked as not applicable. The draft has not changed.');
	}
	function decide(card: { item: UnifiedFinding; proposal?: RevisionProposal }, status: 'accepted' | 'rejected' | 'deferred') {
		const instruction = instructionFor(card).trim();
		const success = status === 'accepted'
			? 'Approved, awaiting application. The draft has not changed.'
			: status === 'rejected'
				? 'Rejected, excluded from revision. The draft has not changed.'
				: 'Deferred. The draft has not changed.';
		void act('queue_editorial_change', {
			findingId: card.item.id,
			instruction,
			reason: card.item.explanation,
			section: card.item.section,
			status,
		}, success);
	}

	return (
		<section className="card mx-auto max-w-3xl space-y-4 p-4 text-sm">
			<div>
				<h2 className="font-medium">Editorial review</h2>
				<ol className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
					<li>1. Run Editorial Pass — {critique ? (reviewStale || critiqueStale ? 'Outdated' : 'Complete') : 'Not run'}</li>
					<li>2. Approve Edits — {approved.length ? `${approved.length} approved, not applied` : 'None approved'}</li>
					<li>3. Preview approved changes — {preview ? 'Preview ready. The article has not changed.' : approved.length ? 'Not yet previewed' : applied.length ? 'Saved on this revision' : 'Waiting for approval'}</li>
				</ol>
				<p className="text-text-soft">
					Current revision {currentRevision ?? '—'}
					{critique && !reviewStale && !critiqueStale ? ' · Editorial pass complete for this revision' : reviewStale || critiqueStale ? ' · Editorial pass outdated' : ' · Editorial pass not run'}
				</p>
				{critique ? <p>Editorial pass completed. {identified} finding{identified === 1 ? '' : 's'} identified. Review and approve the changes you want to make.</p> : <p className="text-text-soft">Critique reads the draft and does not change it.</p>}
				<button className="btn" type="button" disabled={busy} onClick={() => void act('critique_article', {}, 'Editorial pass completed. The draft was not rewritten.')}>Run Editorial Pass of Draft</button>
			</div>
			{reviewStale || critiqueStale ? (
				<p className="text-warning">This editorial pass belongs to an older draft. Approved changes for the current revision can still be previewed.</p>
			) : null}
			{critique?.strengths.length ? <p className="text-text-soft">Preserve: {critique.strengths.join(' · ')}</p> : null}
			{approved.length && !preview ? (
				<div className="rounded border border-primary/40 bg-primary/10 p-3">
					<p>
						{approved.length} edit{approved.length === 1 ? '' : 's'} approved. Ready to preview. The article has not changed yet.
					</p>
					<button className="btn mt-3 border-primary bg-primary/15" type="button" disabled={busy} aria-busy={pending === 'preview_editorial_proposals' || undefined} onClick={() => (onPreview ? onPreview() : void act('preview_editorial_proposals', {}, 'Preview ready. The article was not changed.'))}>
						{pending === 'preview_editorial_proposals' ? 'Preparing preview…' : `Preview ${approved.length} Approved Change${approved.length === 1 ? '' : 's'}`}
					</button>
				</div>
			) : null}
			{preview ? (
				<div className="rounded border border-primary/40 bg-primary/10 p-3">
					<p className="font-medium">Preview ready. Revision {currentRevision ?? '—'} has not changed.</p>
					<p>{preview.summary}</p>
					<p className="text-text-soft">Words {preview.wordCountBefore} → {preview.wordCountAfter}. Only approved instructions are included.</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<button className="btn border-primary bg-primary/15" type="button" disabled={busy} aria-busy={pending === 'apply_editorial_proposals' || undefined} onClick={() => (onConfirm ? onConfirm() : void act('apply_editorial_proposals', {}, 'New revision saved.'))}>
							{pending === 'apply_editorial_proposals' ? 'Saving revision…' : 'Confirm new revision'}
						</button>
						<button className="btn" type="button" disabled={busy} onClick={() => (onCancelPreview ? onCancelPreview() : void act('discard_editorial_preview', {}, 'Preview discarded. The article was not changed.'))}>
							{pending === 'discard_editorial_preview' ? 'Cancelling preview…' : 'Cancel preview'}
						</button>
					</div>
				</div>
			) : null}

			<FindingSection title="Current findings" cards={actionable} groups busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} onSetAside={setAside} />
			<FindingSection title="Approved changes awaiting application" cards={approved} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} onUndo={(card) => void act('queue_editorial_change', { findingId: card.item.id, instruction: instructionFor(card), reason: card.item.explanation, section: card.item.section, status: 'proposed' }, 'Approval removed. The draft has not changed.')} />
			<FindingSection title="Applied changes and verification" cards={applied} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} />
			<FindingSection title="Rejected or deferred findings" cards={held} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} onUndo={(card) => void act('queue_editorial_change', { findingId: card.item.id, instruction: instructionFor(card), reason: card.item.explanation, section: card.item.section, status: 'proposed' }, 'Decision removed. The draft has not changed.')} />

			<details className="border-t border-edge/50 pt-3">
				<summary className="font-medium">Add an instruction that is not listed</summary>
				<div className="mt-2 space-y-2">
					<textarea className="input w-full" rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Name the passage and what must be preserved." />
					<button className="btn" type="button" disabled={busy || !feedback.trim()} onClick={() => void act('editorial_feedback', { feedback }, 'Instruction saved as pending review. It will not be included until you approve it.')}>Save extra instruction</button>
				</div>
			</details>
			{proposals.filter((item) => !item.sourceFindingId && item.status !== 'applied').map((proposal) => {
				const draft = extraEdits[proposal.id] ?? proposal.action;
				const included = proposal.status === 'accepted';
				return (
					<div key={proposal.id} className="border-t border-edge/50 pt-2">
						<p className="text-xs uppercase text-text-dim">{lifecycleLabel(proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'deferred' ? 'deferred' : 'pending')}</p>
						<p className="text-text-soft">{included ? 'Included in the next revision.' : 'Not included in the next revision.'}</p>
						<label className="mt-2 block text-text-soft">
							Additional instruction
							<textarea className="input mt-1 w-full" rows={3} value={draft} disabled={busy} onChange={(event) => setExtraEdits((current) => ({ ...current, [proposal.id]: event.target.value }))} />
						</label>
						<div className="mt-2 flex flex-wrap gap-2">
							<button className="btn" type="button" disabled={busy || !draft.trim() || (draft === proposal.action && proposal.status === 'accepted')} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: 'accepted', instruction: draft }, 'Instruction approved. It will be included in the next preview.')}>Approve</button>
							<button className="btn" type="button" disabled={busy || !draft.trim() || draft === proposal.action} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: proposal.status, instruction: draft }, 'Instruction updated. The article was not changed.')}>Save edit</button>
							<button className="btn" type="button" disabled={busy || proposal.status === 'deferred'} onClick={() => void act('editorial_proposal', { proposalId: proposal.id, status: 'deferred', instruction: draft }, 'Instruction deferred. It will not be included.')}>Defer</button>
							<button className="btn" type="button" disabled={busy} onClick={() => void act('remove_editorial_proposal', { proposalId: proposal.id }, 'Instruction removed. The article was not changed.')}>Remove</button>
						</div>
					</div>
				);
			})}
			{preview ? (
				<div className="space-y-2 border-t border-edge/50 pt-3">
					<p className="font-medium">Preview only. Nothing has been applied.</p>
					<p>{preview.summary}</p>
					<p className="text-text-soft">Words {preview.wordCountBefore} → {preview.wordCountAfter}. Rejected and deferred findings are excluded.</p>
					<DiffView before={body} after={preview.proposedBody} />
				</div>
			) : null}
			{cards.some((card) => card.item.explanation.toLowerCase().includes('brand brain')) ? (
				<p><a className="btn" href="/intelligence">Update Brand Brain</a> <button className="btn" type="button" onClick={onResearch}>Review research</button></p>
			) : null}
		</section>
	);
}

function FindingSection({
	title,
	cards,
	groups,
	busy,
	instructionFor,
	onInstruction,
	onDecide,
	onUndo,
	onSetAside,
}: {
	title: string;
	cards: Array<{ item: UnifiedFinding; proposal?: RevisionProposal; state: FindingLifecycle }>;
	groups?: boolean;
	busy: boolean;
	instructionFor: (card: { item: UnifiedFinding; proposal?: RevisionProposal }) => string;
	onInstruction: (id: string, value: string) => void;
	onDecide: (card: { item: UnifiedFinding; proposal?: RevisionProposal }, status: 'accepted' | 'rejected' | 'deferred') => void;
	onUndo?: (card: { item: UnifiedFinding; proposal?: RevisionProposal }) => void;
	onSetAside?: (card: { item: UnifiedFinding; proposal?: RevisionProposal }, reason: string) => void;
}) {
	if (!cards.length) return null;
	const blocks = groups ? GROUPS.map((group) => ({ group, cards: cards.filter((card) => findingGroup(card.item.severity) === group) })).filter((block) => block.cards.length) : [{ group: '', cards }];
	return (
		<div className="space-y-3">
			<h3 className="font-medium">{title}</h3>
			{blocks.map((block) => (
				<div key={block.group || title}>
					{block.group ? <p className="text-xs uppercase text-text-dim">{block.group}</p> : null}
					<ul className="space-y-3">
						{block.cards.map((card) => (
							<FindingCard key={card.item.id} card={card} busy={busy} instruction={instructionFor(card)} onInstruction={onInstruction} onDecide={onDecide} onUndo={onUndo} onSetAside={onSetAside} />
						))}
					</ul>
				</div>
			))}
		</div>
	);
}

function FindingCard({
	card,
	busy,
	instruction,
	onInstruction,
	onDecide,
	onUndo,
	onSetAside,
}: {
	card: { item: UnifiedFinding; proposal?: RevisionProposal; state: FindingLifecycle };
	busy: boolean;
	instruction: string;
	onInstruction: (id: string, value: string) => void;
	onDecide: (card: { item: UnifiedFinding; proposal?: RevisionProposal }, status: 'accepted' | 'rejected' | 'deferred') => void;
	onUndo?: (card: { item: UnifiedFinding; proposal?: RevisionProposal }) => void;
	onSetAside?: (card: { item: UnifiedFinding; proposal?: RevisionProposal }, reason: string) => void;
}) {
	const [showFix, setShowFix] = useState(false);
	const [editing, setEditing] = useState(false);
	const [reason, setReason] = useState('');
	const open = card.state === 'pending' || card.state === 'applied-unresolved' || card.state === 'stale';
	return (
		<li className="border-t border-edge/50 pt-2">
			<p className="font-medium">{card.item.title}</p>
			<p className="text-xs uppercase text-text-dim">{card.item.severity} · {card.item.source}{card.item.section ? ` · ${card.item.section}` : ''} · {lifecycleLabel(card.state, card.item.appliedRevisionNumber)}</p>
			<p><span className="text-text-soft">Explanation. </span>{card.item.explanation}</p>
			{card.item.historyNote ? <p className="text-text-soft">{card.item.historyNote}</p> : null}
			<p className="text-text-soft">Affected content. {card.item.section ? `Section “${card.item.section}”. ` : ''}{card.item.evidence.length ? card.item.evidence.slice(0, 4).join(' ') : 'No quoted passage was recorded.'}</p>
			{showFix ? (
				<div className="mt-2 rounded border border-edge/60 p-2">
					<p className="text-text-soft">Recommended resolution</p>
					<p>{card.item.correction}</p>
					<p className="text-xs text-text-soft">Approving this suggestion does not change the draft until you preview it.</p>
				</div>
			) : null}
			{editing ? (
				<label className="mt-2 block text-text-soft">
					Manual resolution
					<textarea className="input mt-1 w-full" rows={3} value={instruction} disabled={busy || card.state === 'resolved'} onChange={(event) => onInstruction(card.item.id, event.target.value)} />
				</label>
			) : null}
			{open && onSetAside && card.item.dismissible ? (
				<label className="mt-2 block text-text-soft">
					Reason it does not apply
					<input className="input mt-1 w-full" value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
				</label>
			) : null}
			{open && !card.item.dismissible ? <p className="text-text-soft">This has to be corrected before approval. It cannot be marked not applicable.</p> : null}
			<div className="mt-2 flex flex-wrap gap-2">
				{open ? <button className="btn" type="button" disabled={busy} onClick={() => setShowFix((current) => !current)}>Review suggested fix</button> : null}
				{open ? <button className="btn" type="button" disabled={busy} onClick={() => setEditing((current) => !current)}>Edit manually</button> : null}
				{card.state === 'pending' || card.state === 'applied-unresolved' ? (
					<button className="btn" type="button" disabled={busy} onClick={() => onDecide(card, 'accepted')}>{card.state === 'applied-unresolved' ? 'Approve again' : 'Approve'}</button>
				) : null}
				{card.state === 'approved' ? <span className="btn">Approved, awaiting application</span> : null}
				{open && onSetAside && card.item.dismissible ? (
					<button className="btn" type="button" disabled={busy || reason.trim().length < 8} onClick={() => onSetAside(card, reason.trim())}>Mark as not applicable</button>
				) : null}
				{card.state === 'pending' || card.state === 'approved' || card.state === 'deferred' || card.state === 'applied-unresolved' ? (
					<button className="btn" type="button" disabled={busy} onClick={() => onDecide(card, 'deferred')}>Defer</button>
				) : null}
				{onUndo && (card.state === 'approved' || card.state === 'rejected' || card.state === 'deferred') ? (
					<button className="btn" type="button" disabled={busy} onClick={() => onUndo(card)}>Undo</button>
				) : null}
			</div>
		</li>
	);
}
