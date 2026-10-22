/** Short label for asset cards so long generation prompts do not blow up mobile layout. */
export function brandAssetCardHeadline(input: {
	title?: string;
	libraryType?: string;
	visionAnalysis?: { summary?: string };
}): string {
	const summary = input.visionAnalysis?.summary?.trim();
	if (summary) return summary;

	const title = input.title?.trim();
	if (!title) return input.libraryType ?? 'Asset';

	const exactQuote =
		title.match(/reading exactly '([^']+)'/i)?.[1] ??
		title.match(/headline spelled exactly: ([^.]+)/i)?.[1]?.trim() ??
		title.match(/headline reading exactly: ([^.]+)/i)?.[1]?.trim();
	if (exactQuote) return exactQuote;

	if (title.length <= 96) return title;
	return `${title.slice(0, 93).trim()}…`;
}

export function brandAssetCardDetail(input: {
	description?: string;
	title?: string;
	visionAnalysis?: { summary?: string };
}): string | undefined {
	const description = input.description?.trim();
	if (description && description !== input.title?.trim()) return description;
	return undefined;
}
