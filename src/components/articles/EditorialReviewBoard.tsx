'use client';

import { useState } from 'react';
import { DiffView } from '@/components/articles/RevisionDiff';
import type { EditorialCritique, RevisionProposal, RevisionPreview } from '@/lib/articles/editorialDesk';
import type { ArticleEditorialFinding } from '@/lib/articles/types';
import { findingGroup, findingTitle } from '@/lib/articles/workspaceNavigation';
import { findingLifecycle, lifecycleLabel, type FindingLifecycle } from '@/lib/articles/reviewWorkflow';
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
	const [instructions, setInstructions] = useState<Record<string, string>>({});
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
					<li>3. Apply Edits to Draft — {approved.length ? 'Not yet applied' : applied.length ? 'Saved on this revision' : 'Waiting for approval'}</li>
				</ol>
				<p className="text-text-soft">
					Current revision {currentRevision ?? '—'}
					{critique && !reviewStale && !critiqueStale ? ' · Editorial pass complete for this revision' : reviewStale || critiqueStale ? ' · Editorial pass outdated' : ' · Editorial pass not run'}
				</p>
				{critique ? <p>Editorial pass completed. {identified} finding{identified === 1 ? '' : 's'} identified. Review and approve the changes you want to make.</p> : <p className="text-text-soft">Critique reads the draft and does not change it.</p>}
			</div>
			{reviewStale || critiqueStale ? (
				<p className="text-warning">This review belongs to an older draft. Run the editorial pass again before applying changes.</p>
			) : null}
			{critique?.strengths.length ? <p className="text-text-soft">Preserve: {critique.strengths.join(' · ')}</p> : null}
			{approved.length ? (
				<p className="rounded border border-primary/40 bg-primary/10 p-3">
					{approved.length} edit{approved.length === 1 ? '' : 's'} approved. Ready to apply to draft. The article has not changed yet.
				</p>
			) : null}

			<FindingSection title="Current findings" cards={actionable} groups busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} />
			<FindingSection title="Approved changes awaiting application" cards={approved} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} onUndo={(card) => void act('queue_editorial_change', { findingId: card.item.id, instruction: instructionFor(card), reason: card.item.explanation, section: card.item.section, status: 'proposed' }, 'Approval removed. The draft has not changed.')} />
			<FindingSection title="Applied changes and verification" cards={applied} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} />
			<FindingSection title="Rejected or deferred findings" cards={held} busy={busy} instructionFor={instructionFor} onInstruction={(id, value) => setInstructions((current) => ({ ...current, [id]: value }))} onDecide={decide} onUndo={(card) => void act('queue_editorial_change', { findingId: card.item.id, instruction: instructionFor(card), reason: card.item.explanation, section: card.item.section, status: 'proposed' }, 'Decision removed. The draft has not changed.')} />

			<details className="border-t border-edge/50 pt-3">
				<summary className="font-medium">Add an instruction that is not listed</summary>
				<div className="mt-2 space-y-2">
					<textarea className="input w-full" rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Name the passage and what must be preserved." />
					<button className="btn" type="button" disabled={busy || !feedback.trim()} onClick={() => void act('editorial_feedback', { feedback }, 'Instruction saved. The article was not changed.')}>Save extra instruction</button>
				</div>
			</details>
			{proposals.filter((item) => !item.sourceFindingId && item.status !== 'applied').map((proposal) => (
				<div key={proposal.id} className="border-t border-edge/50 pt-2">
					<p className="text-xs uppercase text-text-dim">{lifecycleLabel(proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'deferred' ? 'deferred' : 'pending')}</p>
					<p>{proposal.action}</p>
					<p className="text-text-soft">{proposal.reason}</p>
				</div>
			))}
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
}: {
	title: string;
	cards: Array<{ item: UnifiedFinding; proposal?: RevisionProposal; state: FindingLifecycle }>;
	groups?: boolean;
	busy: boolean;
	instructionFor: (card: { item: UnifiedFinding; proposal?: RevisionProposal }) => string;
	onInstruction: (id: string, value: string) => void;
	onDecide: (card: { item: UnifiedFinding; proposal?: RevisionProposal }, status: 'accepted' | 'rejected' | 'deferred') => void;
	onUndo?: (card: { item: UnifiedFinding; proposal?: RevisionProposal }) => void;
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
							<li key={card.item.id} className="border-t border-edge/50 pt-2">
								<p className="font-medium">{card.item.title}</p>
								<p className="text-xs uppercase text-text-dim">{card.item.source}{card.item.section ? ` · ${card.item.section}` : ''} · {lifecycleLabel(card.state, card.item.appliedRevisionNumber)}</p>
								<p>{card.item.explanation}</p>
								{card.item.historyNote ? <p className="text-text-soft">{card.item.historyNote}</p> : null}
								{card.item.evidence.length ? <p className="text-text-soft">Evidence: {card.item.evidence.slice(0, 3).join(' · ')}</p> : null}
								<label className="mt-2 block text-text-soft">
									Instruction
									<textarea className="input mt-1 w-full" rows={3} value={instructionFor(card)} disabled={busy || card.state === 'resolved' || card.state === 'stale'} onChange={(event) => onInstruction(card.item.id, event.target.value)} />
								</label>
								<div className="mt-2 flex flex-wrap gap-2">
									{card.state === 'pending' || card.state === 'applied-unresolved' ? (
										<button className="btn" type="button" disabled={busy} onClick={() => onDecide(card, 'accepted')}>{card.state === 'applied-unresolved' ? 'Approve again' : 'Approve'}</button>
									) : null}
									{card.state === 'approved' ? <span className="btn">✓ Approved, awaiting application</span> : null}
									{card.state === 'pending' || card.state === 'approved' || card.state === 'deferred' ? (
										<button className="btn" type="button" disabled={busy} onClick={() => onDecide(card, 'rejected')}>Reject</button>
									) : null}
									{card.state === 'pending' || card.state === 'approved' || card.state === 'rejected' ? (
										<button className="btn" type="button" disabled={busy} onClick={() => onDecide(card, 'deferred')}>Defer</button>
									) : null}
									{onUndo && (card.state === 'approved' || card.state === 'rejected' || card.state === 'deferred') ? (
										<button className="btn" type="button" disabled={busy} onClick={() => onUndo(card)}>Undo</button>
									) : null}
								</div>
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	);
}
