export type TitleSuggestion = {
	title: string;
	rationale: string;
};

/** Deterministic headline alternatives — no unsupported SEO/AEO performance claims. */
export function suggestArticleTitles(input: {
	currentTitle: string;
	topic: string;
	primaryKeyword?: string | null;
	audience?: string | null;
	searchIntent?: string | null;
	readerOutcome?: string | null;
	existingTitles?: string[];
}): TitleSuggestion[] {
	const keyword = (input.primaryKeyword || input.topic).trim();
	const audience = (input.audience || 'readers').trim();
	const outcome = (input.readerOutcome || '').trim();
	const intent = (input.searchIntent || 'informational').trim();
	const existing = new Set((input.existingTitles ?? []).map((title) => title.trim().toLowerCase()));
	existing.add(input.currentTitle.trim().toLowerCase());

	const candidates: TitleSuggestion[] = [
		{
			title: keyword.match(/how to/i) ? titleCase(keyword) : `How to ${titleCase(keyword)}`,
			rationale: `Matches ${intent} intent and leads with the primary topic readers search for.`,
		},
		{
			title: outcome
				? `${titleCase(keyword)}: ${clip(outcome, 48)}`
				: `${titleCase(keyword)} for ${clip(audience, 40)}`,
			rationale: outcome
				? 'States the reader outcome after the topic so the headline stays specific.'
				: 'Names the audience so the published H1 stays distinct from sibling articles.',
		},
		{
			title: `${titleCase(keyword)} Without Getting Stuck`,
			rationale: 'Keeps the primary keyword while signalling a practical, beginner-friendly benefit.',
		},
	];

	const unique: TitleSuggestion[] = [];
	for (const candidate of candidates) {
		const cleaned = clip(candidate.title.replace(/\s+/g, ' ').trim(), 70);
		if (!cleaned || existing.has(cleaned.toLowerCase())) continue;
		existing.add(cleaned.toLowerCase());
		unique.push({ ...candidate, title: cleaned });
		if (unique.length >= 3) break;
	}
	return unique;
}

function titleCase(value: string): string {
	return value
		.split(/\s+/)
		.map((word) => (word.length <= 3 && /^(a|an|the|for|and|or|of|to|in|on)$/i.test(word) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ')
		.replace(/^./, (char) => char.toUpperCase());
}

function clip(value: string, max: number): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1).trim()}…`;
}
