'use client';

import { useMemo, useState } from 'react';
import { diffParagraphs } from '@/lib/articles/structure';
import type { ArticleRevisionRef } from '@/lib/articles/types';

const SOURCE_LABELS: Record<ArticleRevisionRef['source'], string> = {
	generation: 'Generated',
	manual: 'Edited by hand',
	revision: 'Recommendations applied',
	legacy: 'Imported',
	structural_repair: 'Structural repair',
	improvement: 'AI editorial improvement',
};

export function DiffView({ before, after }: { before: string; after: string }) {
	const parts = useMemo(() => diffParagraphs(before, after), [before, after]);
	const changed = parts.filter((part) => part.type !== 'same').length;
	const [showSame, setShowSame] = useState(false);
	const [sideBySide, setSideBySide] = useState(false);
	if (!changed) return <p className="text-sm">No differences.</p>;
	const visible = parts.filter((part) => showSame || part.type !== 'same');
	return (
		<div className="space-y-2 text-sm">
			<div className="flex flex-wrap gap-3">
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={showSame} onChange={(event) => setShowSame(event.target.checked)} /> Show unchanged paragraphs
				</label>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={sideBySide} onChange={(event) => setSideBySide(event.target.checked)} /> Side by side
				</label>
			</div>
			<p className="text-xs text-text-soft">{parts.filter((part) => part.type === 'added').length} additions · {parts.filter((part) => part.type === 'removed').length} deletions</p>
			{sideBySide ? (
				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-2">
						<p className="text-xs uppercase text-text-dim">Before</p>
						{visible.filter((part) => part.type !== 'added').map((part, index) => (
							<p key={index} className={`whitespace-pre-wrap rounded p-2 ${part.type === 'removed' ? 'bg-danger/15 line-through' : 'text-text-soft'}`}>{part.text}</p>
						))}
					</div>
					<div className="space-y-2">
						<p className="text-xs uppercase text-text-dim">After</p>
						{visible.filter((part) => part.type !== 'removed').map((part, index) => (
							<p key={index} className={`whitespace-pre-wrap rounded p-2 ${part.type === 'added' ? 'bg-accent/15' : 'text-text-soft'}`}>{part.text}</p>
						))}
					</div>
				</div>
			) : (
				<div className="max-h-[32rem] overflow-auto space-y-2">
					{visible.map((part, index) => (
						<div
							key={index}
							className={`whitespace-pre-wrap rounded p-2 ${part.type === 'added' ? 'bg-accent/15 border-l-2 border-accent' : part.type === 'removed' ? 'bg-danger/15 border-l-2 border-danger line-through decoration-danger/50' : 'text-text-soft'}`}
						>
							<span className="sr-only">{part.type === 'added' ? 'Added: ' : part.type === 'removed' ? 'Removed: ' : ''}</span>
							{part.text}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function RevisionHistory({
	revisions,
	bodies,
	currentId,
	onRestore,
}: {
	revisions: ArticleRevisionRef[];
	bodies: Record<string, string>;
	currentId: string | null;
	onRestore?: (revisionId: string) => void;
}) {
	const ordered = [...revisions].sort((a, b) => b.number - a.number);
	const [afterId, setAfterId] = useState(currentId ?? ordered[0]?.id ?? '');
	const [beforeId, setBeforeId] = useState(ordered[1]?.id ?? '');
	if (ordered.length < 2) return <p className="text-sm">Only one revision so far.</p>;
	return (
		<div className="space-y-3">
			<ol className="text-sm space-y-1">
				{ordered.map((revision) => (
					<li key={revision.id}>
						Revision {revision.number}{revision.id === currentId ? ' (current)' : ''} · {SOURCE_LABELS[revision.source]} · {revision.wordCount.toLocaleString()} words · {new Date(revision.createdAt).toLocaleString()}
						{revision.note ? ` — ${revision.note}` : ''}
						{onRestore && revision.id !== currentId ? (
							<button className="btn ml-2" type="button" onClick={() => onRestore(revision.id)}>Restore as new revision</button>
						) : null}
					</li>
				))}
			</ol>
			<div className="flex flex-wrap gap-3">
				<label className="text-sm">Before
					<select className="input ml-2" value={beforeId} onChange={(event) => setBeforeId(event.target.value)}>
						{ordered.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.number}</option>)}
					</select>
				</label>
				<label className="text-sm">After
					<select className="input ml-2" value={afterId} onChange={(event) => setAfterId(event.target.value)}>
						{ordered.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.number}</option>)}
					</select>
				</label>
			</div>
			<DiffView before={bodies[beforeId] ?? ''} after={bodies[afterId] ?? ''} />
		</div>
	);
}
