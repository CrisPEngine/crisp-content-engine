const PLACEHOLDER_ALT_TEXTS = new Set([
	'State what the visual shows.',
	'Describe the image.',
]);

export function isPlaceholderAltText(value?: string | null): boolean {
	const trimmed = value?.trim();
	if (!trimmed) return true;
	return PLACEHOLDER_ALT_TEXTS.has(trimmed);
}

export function resolveAssetAltText(input: {
	altText?: string | null;
	altTextDirection?: string | null;
	topic?: string;
	concept?: string | null;
	title?: string | null;
}): string {
	for (const candidate of [input.altText, input.altTextDirection, input.title, input.concept]) {
		if (candidate?.trim() && !isPlaceholderAltText(candidate)) return candidate.trim();
	}
	const subject = input.topic?.trim() || input.concept?.trim() || input.title?.trim();
	if (subject) {
		const clipped = subject.length > 120 ? `${subject.slice(0, 117)}…` : subject;
		return `Visual supporting: ${clipped}.`;
	}
	return 'Image attached to this post.';
}
