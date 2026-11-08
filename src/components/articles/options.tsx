'use client';

import { useState } from 'react';

export const SEARCH_INTENT_OPTIONS = [
	{ value: 'informational', label: 'Informational' },
	{ value: 'commercial investigation', label: 'Commercial investigation' },
	{ value: 'transactional', label: 'Transactional' },
	{ value: 'navigational', label: 'Navigational' },
	{ value: 'mixed', label: 'Mixed' },
];

export const DEFAULT_CONTENT_TYPES = ['guide', 'pillar', 'how-to', 'listicle', 'comparison', 'checklist', 'case study', 'opinion', 'news'];

export const BRIEF_FIELDS: Array<{ key: string; label: string; hint: string; rows: number }> = [
	{ key: 'secondaryKeywords', label: 'Secondary keywords', hint: 'One per line.', rows: 2 },
	{ key: 'questions', label: 'Questions to answer', hint: 'One per line. These shape the outline.', rows: 3 },
	{ key: 'avoid', label: 'Topics to avoid', hint: 'Anything the article must not cover or claim.', rows: 2 },
	{ key: 'tone', label: 'Tone', hint: 'Leave empty to use the Brand Brain voice.', rows: 1 },
	{ key: 'cta', label: 'Call to action', hint: 'Placed in the final section.', rows: 1 },
	{ key: 'requiredLinks', label: 'Required links', hint: 'One URL per line. Review flags any that are missing.', rows: 2 },
	{ key: 'referenceMaterial', label: 'Reference material', hint: 'Notes or URLs the writer should draw on.', rows: 3 },
	{ key: 'instructions', label: 'Instructions', hint: 'Anything else the writer needs to know.', rows: 3 },
];

/** A select whose last option, Other, reveals a free-text input. The stored value is the custom text. */
export function ChoiceWithOther({
	label,
	value,
	options,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const known = options.some((option) => option.value === value);
	const [other, setOther] = useState(!known && value !== '');
	const selected = other ? '__other' : value;
	return (
		<div className="space-y-1">
			<label className="block text-sm">
				{label}
				<select
					className="input w-full"
					value={selected}
					disabled={disabled}
					onChange={(event) => {
						if (event.target.value === '__other') {
							setOther(true);
							onChange('');
						} else {
							setOther(false);
							onChange(event.target.value);
						}
					}}
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>{option.label}</option>
					))}
					<option value="__other">Other</option>
				</select>
			</label>
			{other ? (
				<input
					className="input w-full"
					aria-label={`${label}, other`}
					placeholder="Describe it"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
					required
				/>
			) : null}
		</div>
	);
}

export function contentTypeOptions(types: string[]) {
	return Array.from(new Set(types)).map((type) => ({ value: type, label: type.charAt(0).toUpperCase() + type.slice(1) }));
}
