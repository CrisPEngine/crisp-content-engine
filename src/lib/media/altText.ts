const PLACEHOLDER_ALT_TEXTS = new Set([
	'State what the visual shows.',
	'Describe the image.',
	'Describe the hero image accurately for accessibility.',
	'Describe the social share image accurately for a small preview.',
	'Describe the scene or diagram a reader needs if they cannot see it.',
	'Name the product view and what the reader is meant to notice.',
	'Image attached to this post.',
]);

export function isPlaceholderAltText(value?: string | null): boolean {
	const trimmed = value?.trim();
	if (!trimmed) return true;
	if (PLACEHOLDER_ALT_TEXTS.has(trimmed)) return true;
	if (/^describe (the |what )/i.test(trimmed)) return true;
	if (/^state what the visual/i.test(trimmed)) return true;
	if (/^visual supporting:/i.test(trimmed)) return true;
	if (/for accessibility\.?$/i.test(trimmed) && trimmed.length < 90) return true;
	return false;
}

export function resolveAssetAltText(input: {
	altText?: string | null;
	altTextDirection?: string | null;
	topic?: string;
	concept?: string | null;
	title?: string | null;
}): string {
	if (input.altText?.trim() && !isPlaceholderAltText(input.altText)) return input.altText.trim();
	// Do not promote instructional altTextDirection into stored alt text.
	return '';
}
