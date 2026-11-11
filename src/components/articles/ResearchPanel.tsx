'use client';

import { useState } from 'react';
import { SOURCE_CLASS_LABELS, evidenceLevel, type EvidenceLevel } from '@/lib/articles/sourceClass';
import { researchApprovalGap } from '@/lib/articles/researchPackage';
import type { ResearchItemKind, ResearchPackage, ResearchPackageItem, ResearchPackageSource } from '@/lib/articles/types';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

const KIND_LABELS: Record<ResearchItemKind, string> = {
	topic: 'Topic research',
	competitor: 'Competitor material',
	brand: 'Brand context',
	user: 'Author expertise and added evidence',
	recommendation: 'Recommendations',
};

const STATUS_LABELS: Record<ResearchPackage['status'], string> = {
	empty: 'Not researched',
	draft: 'Draft, not approved',
	approved: 'Approved',
	changed_since_approval: 'Changed since approval',
};

const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
	reported_experience: 'Reported experience',
	expert_recommendation: 'Expert recommendation',
	verified: 'Verified evidence',
	brand: 'Brand / internal',
	background: 'Background only',
};

function sourceEvidence(source: ResearchPackageSource | undefined): EvidenceLevel | null {
	if (!source?.classification) return null;
	return evidenceLevel(source.classification);
}

function ItemRow({ item, sources, busy, act }: { item: ResearchPackageItem; sources: ResearchPackage['sources']; busy: boolean; act: Act }) {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(item.text);
	const linked = sources.filter((source) => item.sourceIds.includes(source.id));
	const levels = [...new Set(linked.map((source) => sourceEvidence(source)).filter(Boolean))] as EvidenceLevel[];
	return (
		<li className={`border-t border-edge/50 pt-2 ${item.excluded ? 'opacity-60' : ''}`}>
			{editing ? (
				<textarea className="input w-full" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
			) : (
				<p className={item.excluded ? 'line-through' : ''}>{item.text}</p>
			)}
			<p className="text-xs text-text-soft">
				{linked.length ? linked.map((source) => source.domain).join(', ') : 'No source'}
				{levels.length ? ` · ${levels.map((level) => EVIDENCE_LABELS[level]).join(', ')}` : ''}
				{!item.supported ? ' · unsupported, needs a source before it is stated as fact' : ''}
				{` · added in version ${item.addedInVersion}`}
				{item.excluded && item.excludedReason ? ` · removed: ${item.excludedReason}` : ''}
			</p>
			<div className="flex flex-wrap gap-2 pt-1">
				{editing ? (
					<>
						<button
							className="btn"
							type="button"
							disabled={busy || !text.trim()}
							onClick={async () => {
								if (await act('research_edit', { edit: { op: 'edit', id: item.id, text } }, 'Finding updated.')) setEditing(false);
							}}
						>
							Save finding
						</button>
						<button className="btn" type="button" onClick={() => { setText(item.text); setEditing(false); }}>Cancel</button>
					</>
				) : (
					<button className="btn" type="button" disabled={busy || item.excluded} onClick={() => setEditing(true)}>Edit</button>
				)}
				<button
					className="btn"
					type="button"
					disabled={busy}
					onClick={() => act('research_edit', { edit: { op: item.excluded ? 'restore' : 'exclude', id: item.id } }, item.excluded ? 'Finding restored.' : 'Finding removed.')}
				>
					{item.excluded ? 'Restore' : 'Remove'}
				</button>
			</div>
		</li>
	);
}

export function ResearchPanel({ research, busy, pending, act }: { research: ResearchPackage | undefined; busy: boolean; pending: string; act: Act }) {
	const pkg = research;
	const [notes, setNotes] = useState(pkg?.notes ?? '');
	const [expertise, setExpertise] = useState(pkg?.expertise ?? '');
	const [question, setQuestion] = useState('');
	const [sourceUrl, setSourceUrl] = useState('');
	const [sourceNote, setSourceNote] = useState('');
	const [evidence, setEvidence] = useState('');
	const [showExcluded, setShowExcluded] = useState(false);
	const notesDirty = notes !== (pkg?.notes ?? '') || expertise !== (pkg?.expertise ?? '');

	const items = (pkg?.items ?? []).filter((item) => showExcluded || !item.excluded);
	const excludedCount = (pkg?.items ?? []).filter((item) => item.excluded).length + (pkg?.sources ?? []).filter((source) => source.excluded).length;
	const kinds = (Object.keys(KIND_LABELS) as ResearchItemKind[]).filter((kind) => items.some((item) => item.kind === kind));

	return (
		<section className="card p-4 space-y-3" id="research">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-medium">Research</h2>
				<p className="text-sm">
					{STATUS_LABELS[pkg?.status ?? 'empty']}
					{pkg?.version ? ` · version ${pkg.version}` : ''}
					{pkg?.approved ? ` · approved version ${pkg.approved.version}, ${new Date(pkg.approved.approvedAt).toLocaleString()}` : ''}
				</p>
			</div>
			<p className="text-sm text-text-soft">Generation uses only the approved version. New research is added as a new version and never changes the approved copy until you approve again. Community sources stay audience insight, not expert advice.</p>
			{researchApprovalGap(pkg).required ? (
				<div className="text-sm space-y-1">
					<p>{researchApprovalGap(pkg).message}</p>
					{researchApprovalGap(pkg).changes.map((update) => (
						<p className="text-text-soft" key={`${update.version}-${update.createdAt}`}>
							Changed in version {update.version}: {update.kind.replaceAll('_', ' ')} — {update.summary}
							{update.question ? ` Question: ${update.question}` : ''}
						</p>
					))}
				</div>
			) : null}
			{(pkg?.questions?.length ?? 0) > 0 ? (
				<div className="text-sm space-y-1">
					<p className="font-medium">Research questions</p>
					<ul className="list-disc pl-5 text-text-soft">
						{pkg!.questions!.map((entry) => <li key={entry}>{entry}</li>)}
					</ul>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				<button className="btn" type="button" disabled={busy} onClick={() => act('research', { mode: 'initial' }, 'Research added as a new version.')}>
					{pending === 'research' ? 'Researching…' : pkg?.version ? 'Run research again' : 'Research topic'}
				</button>
				<button className="btn" type="button" disabled={busy || !pkg?.version} onClick={() => act('research', { mode: 'deeper' }, 'Deeper research added as a new version.')}>
					Deeper research (reads source pages)
				</button>
			</div>
			<div className="flex flex-wrap gap-2 items-end">
				<label className="block text-sm grow">Follow-up question
					<input className="input w-full" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do published novelists say about daily word targets?" />
				</label>
				<button
					className="btn"
					type="button"
					disabled={busy || !question.trim()}
					onClick={async () => {
						if (await act('research', { mode: 'follow_up', question }, 'Follow-up research added.')) setQuestion('');
					}}
				>
					Ask
				</button>
			</div>

			{kinds.length === 0 ? <p className="text-sm">No findings yet.</p> : null}
			{kinds.map((kind) => (
				<div key={kind} className="space-y-1">
					<h3 className="text-sm font-medium">{KIND_LABELS[kind]}</h3>
					<ul className="text-sm space-y-2">
						{items.filter((item) => item.kind === kind).map((item) => (
							<ItemRow key={`${item.id}:${item.text}`} item={item} sources={pkg?.sources ?? []} busy={busy} act={act} />
						))}
					</ul>
				</div>
			))}

			<details className="text-sm">
				<summary>Sources ({(pkg?.sources ?? []).filter((source) => !source.excluded).length} used, {(pkg?.sources ?? []).filter((source) => source.excluded).length} removed)</summary>
				<ul className="space-y-1 pt-2">
					{(pkg?.sources ?? []).map((source) => (
						<li key={source.id} className={source.excluded ? 'opacity-60' : ''}>
							<a className="underline" href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>
							<span className="text-xs text-text-soft">
								{' · '}
								{source.classification ? SOURCE_CLASS_LABELS[source.classification] : 'Unclassified'}
								{source.classification ? ` · ${EVIDENCE_LABELS[evidenceLevel(source.classification)]}` : ''}
								{` · ${source.domain} · ${source.origin}`}
								{source.retrievedAt ? ` · ${new Date(source.retrievedAt).toLocaleDateString()}` : ''}
								{source.excluded && source.excludedReason ? ` · removed: ${source.excludedReason}` : ''}
							</span>{' '}
							<button
								className="underline text-xs"
								type="button"
								disabled={busy}
								onClick={() => act('research_edit', { edit: { op: source.excluded ? 'restore' : 'exclude', id: source.id } }, source.excluded ? 'Source restored.' : 'Source removed.')}
							>
								{source.excluded ? 'Restore' : 'Remove'}
							</button>
						</li>
					))}
				</ul>
			</details>
			{excludedCount ? (
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} /> Show removed findings
				</label>
			) : null}
			{(pkg?.gaps ?? []).map((gap) => <p className="text-sm" key={gap}>Gap: {gap}</p>)}

			<div className="grid gap-3 md:grid-cols-2">
				<label className="block text-sm">Author expertise
					<textarea className="input w-full" rows={4} value={expertise} onChange={(event) => setExpertise(event.target.value)} placeholder="First-hand experience the article should draw on." />
				</label>
				<label className="block text-sm">Research notes
					<textarea className="input w-full" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Angles, cautions, what to emphasise." />
				</label>
			</div>
			<button className="btn" type="button" disabled={busy || !notesDirty} onClick={() => act('research_edit', { edit: { op: 'notes', notes, expertise } }, 'Notes saved.')}>
				{notesDirty ? 'Save notes and expertise' : 'Notes saved'}
			</button>

			<div className="grid gap-3 md:grid-cols-2">
				<div className="space-y-1">
					<label className="block text-sm">Add a source URL
						<input className="input w-full" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" />
					</label>
					<input className="input w-full text-sm" aria-label="What this source supports" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="What it supports (optional)" />
					<button
						className="btn"
						type="button"
						disabled={busy || !sourceUrl.trim()}
						onClick={async () => {
							if (await act('research_edit', { edit: { op: 'add_source', url: sourceUrl, note: sourceNote } }, 'Source added.')) {
								setSourceUrl('');
								setSourceNote('');
							}
						}}
					>
						Add source
					</button>
				</div>
				<div className="space-y-1">
					<label className="block text-sm">Add evidence
						<textarea className="input w-full" rows={3} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="A fact, quote or example you can stand behind." />
					</label>
					<button
						className="btn"
						type="button"
						disabled={busy || !evidence.trim()}
						onClick={async () => {
							if (await act('research_edit', { edit: { op: 'add_evidence', text: evidence } }, 'Evidence added.')) setEvidence('');
						}}
					>
						Add evidence
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3 border-t border-edge/50 pt-3">
				<button className="btn" type="button" disabled={busy || !pkg?.version || pkg.status === 'approved' || notesDirty} onClick={() => act('approve_research', {}, 'Research approved. Generation will use this version.')}>
					{pkg?.status === 'approved' ? `Approved · version ${pkg.approved?.version}` : `Approve research${pkg?.version ? ` version ${pkg.version}` : ''}`}
				</button>
				{notesDirty ? <span className="text-sm">Save notes before approving.</span> : null}
			</div>

			{pkg?.updates.length ? (
				<details className="text-sm">
					<summary>Research history</summary>
					<ol className="space-y-1 pt-2">
						{[...pkg.updates].reverse().map((update) => (
							<li key={`${update.version}-${update.createdAt}`}>
								Version {update.version} · {update.kind.replace('_', ' ')} · {new Date(update.createdAt).toLocaleString()} — {update.summary}
							</li>
						))}
					</ol>
				</details>
			) : null}
		</section>
	);
}
