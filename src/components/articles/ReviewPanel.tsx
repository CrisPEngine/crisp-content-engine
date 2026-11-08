'use client';

import type { ArticleEditorialFinding, ArticleReviewRun } from '@/lib/articles/types';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

export type RevisionResult = {
	baseRevisionId: string;
	resultRevisionId: string;
	applied: Array<{ id: string; change: string }>;
	notApplied: Array<{ id: string; reason: string }>;
} | null;

const STATE_STYLES: Record<string, string> = {
	pending: 'border-edge text-text-soft',
	accepted: 'border-primary/60 bg-primary/15',
	rejected: 'border-edge text-text-dim',
	applied: 'border-accent/60 bg-accent/15',
	superseded: 'border-edge text-text-dim',
};

const SEVERITY_STYLES: Record<string, string> = {
	critical: 'text-danger',
	major: 'text-warning',
	minor: 'text-text-soft',
};

function FindingRow({ finding, busy, act, locked }: { finding: ArticleEditorialFinding; busy: boolean; act: Act; locked: boolean }) {
	const open = finding.decision === 'pending' || finding.decision === 'accepted';
	return (
		<li className="border-t border-edge/50 pt-2 text-sm space-y-1">
			<div className="flex flex-wrap items-center gap-2">
				<span className={`font-medium uppercase text-xs ${SEVERITY_STYLES[finding.severity]}`}>{finding.severity}</span>
				<span className="text-xs text-text-soft">{finding.dimension.replace(/_/g, ' ')} · {finding.source === 'llm' ? 'editor model' : 'automatic check'}</span>
				<span className={`rounded-full border px-2 py-0.5 text-xs ${STATE_STYLES[finding.decision] ?? ''}`}>{finding.decision}</span>
				{finding.rejectable === false ? <span className="text-xs text-text-soft">must be fixed, cannot be rejected</span> : null}
			</div>
			<p>{finding.instruction}</p>
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
					{editorial.reviewedRevisionNumber ? `Reviewed revision ${editorial.reviewedRevisionNumber}` : 'Not reviewed'}
					{currentRevision ? ` · current revision ${currentRevision.number}` : ''}
				</p>
			</div>
			<p className="text-sm">
				Revision cycles used: <strong>{editorial.cyclesUsed} of {editorial.maxCycles}</strong>.
				{cyclesLeft === 0 ? ' The limit is reached. That is not approval; a person still decides.' : ` ${cyclesLeft} left.`}
			</p>
			{stale ? (
				<p className="text-sm text-warning">
					{editorial.reviewedRevisionNumber
						? `The draft changed after the last review. These findings refer to revision ${editorial.reviewedRevisionNumber}.`
						: 'These findings come from a review that was not tied to a saved revision, so they may not match the current text.'}{' '}
					Run review again before applying or approving.
				</p>
			) : null}
			{openCritical.length ? <p className="text-sm text-danger">{openCritical.length} critical {openCritical.length === 1 ? 'finding is' : 'findings are'} unresolved. Approval is blocked until {openCritical.length === 1 ? 'it is' : 'they are'} fixed or, where allowed, rejected.</p> : null}

			<div className="flex flex-wrap gap-2 items-center">
				<button className="btn" type="button" disabled={busy || revisionRunning} onClick={() => act('review', {}, 'Review finished.')}>
					{pending === 'review' ? 'Reviewing…' : stale || editorial.status === 'not_run' ? 'Run review' : 'Run review again'}
				</button>
				<button className="btn" type="button" disabled={busy || Boolean(applyBlocked)} onClick={() => act('apply_revisions', {}, 'Revision started. A new revision is created and reviewed when it finishes.')}>
					{pending === 'apply_revisions' ? 'Starting…' : `Apply accepted revisions${accepted.length ? ` (${accepted.length})` : ''}`}
				</button>
				{applyBlocked && accepted.length ? <span className="text-xs text-text-soft">{applyBlocked}</span> : null}
			</div>

			{revisionResult ? (
				<div className="rounded border border-edge/60 p-3 text-sm space-y-1">
					<p className="font-medium">Last revision</p>
					{revisionResult.applied.map((item) => {
						const original = historyFindings.find(({ finding }) => finding.id === item.id)?.finding;
						return <p key={item.id}>Applied: {original?.instruction ?? item.id} — {item.change}</p>;
					})}
					{revisionResult.notApplied.map((item) => {
						const original = [...findings, ...historyFindings.map(({ finding }) => finding)].find((finding) => finding.id === item.id);
						return <p key={item.id} className="text-warning">Not applied: {original?.instruction ?? item.id} — {item.reason}. It stays accepted for the next cycle.</p>;
					})}
				</div>
			) : null}

			{sorted.length === 0 && editorial.status !== 'not_run' ? <p className="text-sm">No findings on this revision.</p> : null}
			<ul className="space-y-2">
				{sorted.map((finding) => (
					<FindingRow key={finding.id} finding={finding} busy={busy || revisionRunning} act={act} locked={approved} />
				))}
			</ul>

			{historyFindings.length ? (
				<details className="text-sm">
					<summary>Recommendation history ({appliedHistory.length} applied)</summary>
					<ol className="space-y-1 pt-2">
						{(editorial.history ?? []).slice().reverse().map((run) => (
							<li key={`${run.revisionId}-${run.ranAt}`} className="space-y-1">
								<p className="font-medium">Review of revision {run.revisionNumber} · {new Date(run.ranAt).toLocaleString()}</p>
								<ul className="pl-4 space-y-0.5">
									{run.findings.map((finding) => (
										<li key={finding.id}>
											<span className={`rounded-full border px-1.5 text-xs ${STATE_STYLES[finding.decision] ?? ''}`}>{finding.decision}</span> {finding.severity} — {finding.instruction}
											{finding.decision === 'applied' && appliedMap.get(finding.id) ? ` (${appliedMap.get(finding.id)})` : ''}
										</li>
									))}
								</ul>
							</li>
						))}
					</ol>
				</details>
			) : null}
		</section>
	);
}
