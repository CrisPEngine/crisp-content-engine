'use client';

import { useState } from 'react';
import type { ArticleEditorialFinding, ArticleReviewRun } from '@/lib/articles/types';
import { findingTier } from '@/lib/articles/meta';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;
export type RevisionResult = {
	applied?: Array<{ id: string; change: string }>;
	skipped?: Array<{ id: string; reason: string }>;
	notApplied?: Array<{ id: string; reason: string }>;
	baseRevisionId?: string;
	resultRevisionId?: string;
	articleId?: string;
} | null;

const SEVERITY_STYLES: Record<string, string> = {
	critical: 'text-danger',
	major: 'text-amber-700',
	minor: 'text-text-soft',
};

const STATE_STYLES: Record<string, string> = {
	pending: 'border-edge text-text-soft',
	accepted: 'border-emerald-600/40 text-emerald-800',
	rejected: 'border-edge text-text-soft',
	applied: 'border-emerald-600/40 text-emerald-800',
	superseded: 'border-edge text-text-soft',
};

const TIER_LABELS = { blocking: 'Blocking', important: 'Important', optional: 'Optional' } as const;

function FindingRow({ finding, busy, act, locked }: { finding: ArticleEditorialFinding; busy: boolean; act: Act; locked: boolean }) {
	const open = finding.decision === 'pending' || finding.decision === 'accepted';
	const tier = findingTier(finding);
	const [editing, setEditing] = useState(false);
	const [instruction, setInstruction] = useState(finding.editedInstruction ?? finding.instruction);
	return (
		<li className="border-t border-edge/50 pt-2 text-sm space-y-1">
			<div className="flex flex-wrap items-center gap-2">
				<span className={`font-medium uppercase text-xs ${SEVERITY_STYLES[finding.severity]}`}>{finding.severity}</span>
				<span className="rounded-full border px-2 py-0.5 text-xs">{TIER_LABELS[tier]}</span>
				<span className="text-xs text-text-soft">{finding.dimension.replace(/_/g, ' ')} · {finding.source === 'llm' ? 'editor model' : 'automatic check'}</span>
				<span className={`rounded-full border px-2 py-0.5 text-xs ${STATE_STYLES[finding.decision] ?? ''}`}>{finding.decision}</span>
				{finding.rejectable === false ? <span className="text-xs text-text-soft">must be fixed, cannot be rejected</span> : null}
			</div>
			{finding.section ? <p className="text-xs text-text-soft">Section: {finding.section}</p> : null}
			{editing ? (
				<textarea className="input w-full" rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} />
			) : (
				<p>{finding.editedInstruction ?? finding.instruction}</p>
			)}
			{finding.explanation ? <p className="text-xs text-text-soft">{finding.explanation}</p> : null}
			{(finding.evidence?.length ?? 0) > 0 ? (
				<ul className="text-xs text-text-soft list-disc pl-5">
					{finding.evidence!.map((item) => <li key={item}>{item}</li>)}
				</ul>
			) : null}
			{finding.proposedFix ? (
				<details className="text-xs">
					<summary>Proposed fix</summary>
					<pre className="whitespace-pre-wrap mt-1 rounded border border-edge/50 p-2">{finding.proposedFix}</pre>
				</details>
			) : null}
			{finding.note ? <p className="text-xs text-text-soft">{finding.note}</p> : null}
			{open && !locked ? (
				<div className="flex flex-wrap gap-2">
					{finding.decision !== 'accepted' ? (
						<button className="btn" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'accepted' }, 'Recommendation accepted.')}>Accept</button>
					) : (
						<button className="btn" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'pending' }, 'Recommendation set back to pending.')}>Undo accept</button>
					)}
					{finding.rejectable !== false ? (
						<button className="btn" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'rejected' }, 'Recommendation rejected.')}>Reject</button>
					) : null}
					{editing ? (
						<>
							<button
								className="btn"
								type="button"
								disabled={busy || !instruction.trim()}
								onClick={async () => {
									if (await act('edit_recommendation', { findingId: finding.id, instruction }, 'Recommendation rewritten.')) setEditing(false);
								}}
							>
								Save rewrite
							</button>
							<button className="btn" type="button" onClick={() => { setInstruction(finding.editedInstruction ?? finding.instruction); setEditing(false); }}>Cancel</button>
						</>
					) : (
						<button className="btn" type="button" disabled={busy} onClick={() => setEditing(true)}>Edit instruction</button>
					)}
					{finding.fix ? (
						<button className="btn" type="button" disabled={busy} onClick={() => act('apply_fix', { findingId: finding.id }, 'Deterministic fix applied.')}>Apply fix now</button>
					) : null}
				</div>
			) : null}
			{finding.decision === 'rejected' && !locked ? (
				<button className="underline text-xs" type="button" disabled={busy} onClick={() => act('recommendation', { findingId: finding.id, decision: 'pending' }, 'Recommendation reopened.')}>Reopen</button>
			) : null}
		</li>
	);
}

export function ReviewPanel({
	editorial,
	currentRevision,
	revisionResult,
	revisionRunning,
	approved,
	busy,
	pending,
	act,
}: {
	editorial: {
		status: string;
		cyclesUsed: number;
		maxCycles: number;
		exhausted: boolean;
		findings: ArticleEditorialFinding[];
		reviewedRevisionId?: string | null;
		reviewedRevisionNumber?: number | null;
		history?: ArticleReviewRun[];
	};
	currentRevision: { id: string; number: number } | null;
	revisionResult: RevisionResult;
	revisionRunning: boolean;
	approved: boolean;
	busy: boolean;
	pending: string;
	act: Act;
}) {
	const findings = editorial.findings;
	const stale = Boolean(currentRevision && editorial.status !== 'not_run' && editorial.reviewedRevisionId !== currentRevision.id);
	const accepted = findings.filter((finding) => finding.decision === 'accepted');
	const openCritical = findings.filter((finding) => finding.severity === 'critical' && (finding.decision === 'pending' || finding.decision === 'accepted'));
	const order = { critical: 0, major: 1, minor: 2 } as const;
	const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
	const cyclesLeft = Math.max(0, editorial.maxCycles - editorial.cyclesUsed);
	const applyBlocked = approved
		? 'The article is approved. Changes would need a new approval.'
		: stale
			? 'Run review on the current revision first.'
			: cyclesLeft === 0
				? 'The revision cycle limit is used up. Edit the draft by hand, or a person decides.'
				: revisionRunning
					? 'A revision is already running.'
					: !accepted.length
						? 'Accept at least one recommendation.'
						: '';
	const appliedMap = new Map((revisionResult?.applied ?? []).map((item) => [item.id, item.change]));
	const historyFindings = (editorial.history ?? []).flatMap((run) => run.findings.map((finding) => ({ run, finding })));
	const appliedHistory = historyFindings.filter(({ finding }) => finding.decision === 'applied');

	return (
		<section className="card p-4 space-y-3" id="review">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-medium">Editorial review</h2>
				<p className="text-sm">
					{editorial.status.replace(/_/g, ' ')}
					{editorial.reviewedRevisionNumber ? ` · revision ${editorial.reviewedRevisionNumber}` : ''}
					{` · ${cyclesLeft} revision cycle${cyclesLeft === 1 ? '' : 's'} left`}
				</p>
			</div>
			<p className="text-sm text-text-soft">Blocking findings must be fixed before publication-ready. Accept recommendations, rewrite them, or apply a deterministic fix where offered. Targeted revisions change only accepted items.</p>
			{openCritical.length ? <p className="text-sm text-danger" role="alert">{openCritical.length} blocking finding{openCritical.length === 1 ? '' : 's'} still open.</p> : null}
			<div className="flex flex-wrap gap-2">
				<button className="btn" type="button" disabled={busy || approved} onClick={() => act('review', {}, 'Review complete.')}>
					{pending === 'review' ? 'Reviewing…' : editorial.status === 'not_run' ? 'Run review' : 'Re-run review'}
				</button>
				<button className="btn" type="button" disabled={busy || Boolean(applyBlocked)} onClick={() => act('apply_revisions', {}, 'Revision started for accepted recommendations.')}>
					{revisionRunning || pending === 'apply_revisions' ? 'Revising…' : 'Apply accepted revisions'}
				</button>
			</div>
			{applyBlocked && accepted.length ? <p className="text-xs text-text-soft">{applyBlocked}</p> : null}
			{stale ? <p className="text-sm">The draft changed since this review. Run it again on the current revision.</p> : null}
			{sorted.length === 0 ? <p className="text-sm">No findings yet.</p> : (
				<ul className="space-y-3">
					{sorted.map((finding) => (
						<div key={finding.id}>
							<FindingRow finding={finding} busy={busy || revisionRunning} act={act} locked={approved} />
							{appliedMap.get(finding.id) ? <p className="text-xs text-emerald-800 pl-1">Applied: {appliedMap.get(finding.id)}</p> : null}
						</div>
					))}
				</ul>
			)}
			{appliedHistory.length ? (
				<details className="text-sm">
					<summary>Applied in earlier reviews</summary>
					<ul className="pt-2 space-y-1">
						{appliedHistory.map(({ run, finding }) => (
							<li key={`${run.revisionId}-${finding.id}`}>Revision {run.revisionNumber}: {finding.instruction}</li>
						))}
					</ul>
				</details>
			) : null}
		</section>
	);
}
