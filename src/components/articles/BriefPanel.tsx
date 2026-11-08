'use client';

import { useEffect, useState } from 'react';
import type { BriefSuggestion } from '@/lib/articles/types';
import { BRIEF_FIELDS, ChoiceWithOther, contentTypeOptions, DEFAULT_CONTENT_TYPES, SEARCH_INTENT_OPTIONS } from './options';

type Act = (action: string, extra?: Record<string, unknown>, success?: string) => Promise<boolean>;

export type BriefValues = {
	topic: string;
	workingTitle: string;
	primaryKeyword: string;
	searchIntent: string;
	audience: string;
	contentType: string;
	targetWords: number;
	destinationId: string;
	imageRequirements: string;
	researchRequirements: string;
	internalLinking: string;
	brief: Record<string, string>;
};

const SUGGESTION_LABELS: Record<string, string> = {
	audience: 'Audience',
	primaryKeyword: 'Primary keyword',
	workingTitle: 'Working title',
	...Object.fromEntries(BRIEF_FIELDS.map((field) => [field.key, field.label])),
};

export function BriefPanel({
	initial,
	destinations,
	contentTypes,
	approvedAt,
	changedAfterApproval,
	suggestions,
	busy,
	pending,
	act,
	save,
	onDirtyChange,
}: {
	initial: BriefValues;
	destinations: Array<{ key: string; name: string; enabled: boolean }>;
	contentTypes: string[] | null;
	approvedAt: string | null;
	changedAfterApproval: boolean;
	suggestions: BriefSuggestion[];
	busy: boolean;
	pending: string;
	act: Act;
	save: (values: BriefValues) => Promise<boolean>;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const [values, setValues] = useState(initial);
	const dirty = JSON.stringify(values) !== JSON.stringify(initial);
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

	function set<K extends keyof BriefValues>(key: K, value: BriefValues[K]) {
		setValues((current) => ({ ...current, [key]: value }));
	}
	const setBrief = (key: string, value: string) => setValues((current) => ({ ...current, brief: { ...current.brief, [key]: value } }));
	const types = contentTypeOptions([...(contentTypes?.length ? contentTypes : DEFAULT_CONTENT_TYPES)]);

	return (
		<section className="card p-4 space-y-3" id="brief">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-medium">Brief</h2>
				<p className="text-sm">
					{approvedAt ? `Approved ${new Date(approvedAt).toLocaleString()}` : changedAfterApproval ? 'Changed after approval. Approve again.' : 'Not approved'}
					{dirty ? ' · unsaved changes' : ''}
				</p>
			</div>
			<form
				className="space-y-3"
				onSubmit={async (event) => {
					event.preventDefault();
					await save(values);
				}}
			>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">Topic
						<input className="input w-full" value={values.topic} onChange={(event) => set('topic', event.target.value)} required />
					</label>
					<label className="block text-sm">Working title
						<input className="input w-full" value={values.workingTitle} onChange={(event) => set('workingTitle', event.target.value)} />
					</label>
					<label className="block text-sm">Primary keyword
						<input className="input w-full" value={values.primaryKeyword} onChange={(event) => set('primaryKeyword', event.target.value)} />
					</label>
					<label className="block text-sm">Audience
						<input className="input w-full" value={values.audience} onChange={(event) => set('audience', event.target.value)} />
					</label>
					<ChoiceWithOther label="Search intent" value={values.searchIntent} options={SEARCH_INTENT_OPTIONS} onChange={(value) => set('searchIntent', value)} />
					<ChoiceWithOther label="Content type" value={values.contentType} options={types} onChange={(value) => set('contentType', value)} />
					<label className="block text-sm">Target word count
						<input className="input w-full" type="number" min={300} max={12000} step={100} value={values.targetWords} onChange={(event) => set('targetWords', Number(event.target.value))} />
					</label>
					<label className="block text-sm">Website destination
						<select className="input w-full" value={values.destinationId} onChange={(event) => set('destinationId', event.target.value)}>
							<option value="">Choose later</option>
							{destinations.map((destination) => (
								<option key={destination.key} value={destination.key} disabled={!destination.enabled}>{destination.name}{destination.enabled ? '' : ' (disabled)'}</option>
							))}
						</select>
					</label>
				</div>
				<details className="text-sm" open={Object.values(values.brief).some((value) => value.trim())}>
					<summary>Optional details</summary>
					<div className="grid gap-3 md:grid-cols-2 pt-2">
						{BRIEF_FIELDS.map((field) => (
							<label key={field.key} className="block text-sm">
								{field.label} <span className="text-xs text-text-soft">{field.hint}</span>
								{field.rows > 1 ? (
									<textarea className="input w-full" rows={field.rows} value={values.brief[field.key] ?? ''} onChange={(event) => setBrief(field.key, event.target.value)} />
								) : (
									<input className="input w-full" value={values.brief[field.key] ?? ''} onChange={(event) => setBrief(field.key, event.target.value)} />
								)}
							</label>
						))}
						<label className="block text-sm">Research requirements
							<textarea className="input w-full" rows={2} value={values.researchRequirements} onChange={(event) => set('researchRequirements', event.target.value)} />
						</label>
						<label className="block text-sm">Internal linking
							<textarea className="input w-full" rows={2} value={values.internalLinking} onChange={(event) => set('internalLinking', event.target.value)} />
						</label>
						<label className="block text-sm">Image requirements <span className="text-xs text-text-soft">Write “none” if the article needs no images.</span>
							<input className="input w-full" value={values.imageRequirements} onChange={(event) => set('imageRequirements', event.target.value)} />
						</label>
					</div>
				</details>
				<div className="flex flex-wrap gap-2 items-center">
					<button className="btn" type="submit" disabled={busy || !dirty}>{pending === 'save_brief' ? 'Saving…' : dirty ? 'Save brief' : 'Brief saved'}</button>
					{dirty ? <button className="btn" type="button" onClick={() => setValues(initial)}>Discard changes</button> : null}
					<button className="btn" type="button" disabled={busy || dirty} onClick={() => act('enhance_brief', {}, 'Suggestions ready. Nothing changes until you apply one.')}>
						{pending === 'enhance_brief' ? 'Thinking…' : 'Suggest improvements'}
					</button>
					<button className="btn" type="button" disabled={busy || dirty || Boolean(approvedAt)} onClick={() => act('approve_brief', {}, 'Brief approved.')}>
						{approvedAt ? 'Approved' : 'Approve brief'}
					</button>
					{dirty ? <span className="text-xs text-text-soft">Save before approving.</span> : null}
				</div>
			</form>
			{suggestions.length ? (
				<div className="space-y-2 border-t border-edge/50 pt-3">
					<p className="text-sm font-medium">Suggestions</p>
					<p className="text-xs text-text-soft">Applying adds to the field; existing text is kept.</p>
					{suggestions.map((suggestion, index) => (
						<div key={`${suggestion.field}-${index}`} className="text-sm rounded border border-edge/60 p-2 space-y-1">
							<p className="font-medium">{SUGGESTION_LABELS[suggestion.field] ?? suggestion.field}</p>
							<p className="whitespace-pre-wrap">{suggestion.value}</p>
							<p className="text-xs text-text-soft">{suggestion.reason}</p>
							<div className="flex gap-2">
								<button className="btn" type="button" disabled={busy || dirty} onClick={() => act('brief_suggestion', { index, apply: true }, 'Suggestion applied to the brief.')}>Apply</button>
								<button className="btn" type="button" disabled={busy} onClick={() => act('brief_suggestion', { index, apply: false }, 'Suggestion dismissed.')}>Dismiss</button>
							</div>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}
