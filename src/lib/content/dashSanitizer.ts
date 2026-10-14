const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

/** True when text contains an em dash or an en dash used as clause punctuation. */
export function containsForbiddenDash(text: string): boolean {
	if (!text) return false;
	if (text.includes(EM_DASH)) return true;
	if (/\s[\u2013]\s/.test(text)) return true;
	if (/^[\u2013]\s/m.test(text) || /\s[\u2013]$/m.test(text)) return true;
	return false;
}

/**
 * Replace em dashes and en dashes used as dashes with plain punctuation.
 * En dashes between digits (e.g. date ranges) become a hyphen.
 */
export function sanitizeTextDashes(text: string): { text: string; changed: boolean } {
	if (!text) return { text, changed: false };
	let next = text;
	const before = next;

	next = next.replace(/\s*\u2014\s*/g, ', ');
	next = next.replace(/\u2014/g, ', ');
	next = next.replace(/\s*\u2013\s+/g, ', ');
	next = next.replace(/\s+\u2013\s*/g, ', ');
	next = next.replace(/(?<=\d)\u2013(?=\d)/g, '-');
	next = next.replace(/(?<!\d)\u2013(?!\d)/g, '-');
	next = next.replace(/,\s+,/g, ', ');
	next = next.replace(/[^\S\n]{2,}/g, ' ');

	return { text: next, changed: next !== before };
}

export function sanitizeText(text: string): string {
	return sanitizeTextDashes(text).text;
}

export type SanitizedContentFields = {
	body: string;
	title?: string | null;
	cta?: string | null;
	hook?: string | null;
	argument?: string | null;
	dashAutoFixed: boolean;
};

export function sanitizeContentFields(input: {
	body: string;
	title?: string | null;
	cta?: string | null;
	hook?: string | null;
	argument?: string | null;
}): SanitizedContentFields {
	let dashAutoFixed = false;
	const apply = (value: string | null | undefined): string | undefined => {
		if (value == null || value === '') return value ?? undefined;
		const { text, changed } = sanitizeTextDashes(value);
		if (changed) dashAutoFixed = true;
		return text;
	};
	return {
		body: apply(input.body) ?? '',
		title: apply(input.title ?? undefined),
		cta: apply(input.cta ?? undefined),
		hook: apply(input.hook ?? undefined),
		argument: apply(input.argument ?? undefined),
		dashAutoFixed,
	};
}
