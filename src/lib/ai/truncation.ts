/**
 * Detect model output truncation and enforce word-count ranges for long-form content.
 */

export type WordCountRange = { min: number; max: number };

export function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

const SENTENCE_END = /[.!?…]["')\]]*\s*$/;

/** Heuristic: ends mid-clause without terminal punctuation (allows closing quote/paren). */
export function looksTruncatedMidSentence(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 80) return false;
	if (SENTENCE_END.test(trimmed)) return false;
	if (trimmed.endsWith('—') || trimmed.endsWith(':')) return false;
	const tail = trimmed.slice(-120);
	if (/\[[^\]]*$/.test(tail) || /\([^)]*$/.test(tail)) return true;
	if (/[,;:]\s*[\w'-]+$/.test(tail)) return true;
	return true;
}

export function isOutputTruncated(input: {
	text: string;
	finishReason?: string | null;
	incompleteReason?: string | null;
}): boolean {
	const reason = `${input.finishReason ?? ''} ${input.incompleteReason ?? ''}`.toLowerCase();
	if (
		reason.includes('max_tokens') ||
		reason.includes('max_output') ||
		reason.includes('length') ||
		reason.includes('token')
	) {
		return true;
	}
	return looksTruncatedMidSentence(input.text);
}

export function wordCountInRange(text: string, range: WordCountRange): boolean {
	const count = countWords(text);
	return count >= range.min && count <= range.max;
}

const RANGE_RE = /(\d{3,5})\s*(?:-|–|to)\s*(\d{3,5})\s*words?/i;
const MIN_WORDS_RE = /(?:at least|minimum|min\.?)\s*(\d{3,5})\s*words?/i;
const TARGET_WORDS_RE = /(\d{3,5})\s*\+?\s*words?/i;
const LONG_FORM_PHRASE = /\blong[-\s]?form\b/i;

export function parseWordCountRangeFromText(text: string): WordCountRange | null {
	const range = text.match(RANGE_RE);
	if (range) {
		const min = parseInt(range[1], 10);
		const max = parseInt(range[2], 10);
		if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
			return { min, max };
		}
	}
	const minOnly = text.match(MIN_WORDS_RE);
	if (minOnly) {
		const min = parseInt(minOnly[1], 10);
		if (Number.isFinite(min) && min > 0) return { min, max: min + Math.round(min * 0.35) };
	}
	const single = text.match(TARGET_WORDS_RE);
	if (single) {
		const target = parseInt(single[1], 10);
		if (Number.isFinite(target) && target >= 800) {
			return { min: Math.round(target * 0.85), max: Math.round(target * 1.15) };
		}
	}
	return null;
}

export function defaultLongFormWordRange(channel: string): WordCountRange {
	if (channel === 'blog') return { min: 1200, max: 8000 };
	return { min: 900, max: 1400 };
}

export function isLongFormGeneration(input: {
	channel: string;
	contentType?: string;
	userIntent: string;
}): boolean {
	const type = (input.contentType ?? '').toLowerCase();
	if (type === 'article' || type === 'long_form' || type === 'longform') return true;
	if (input.channel === 'blog') return true;
	if (LONG_FORM_PHRASE.test(input.userIntent)) return true;
	const parsed = parseWordCountRangeFromText(input.userIntent);
	return parsed != null && parsed.min >= 700;
}

export function resolveLongFormWordRange(input: {
	channel: string;
	contentType?: string;
	userIntent: string;
}): WordCountRange {
	return parseWordCountRangeFromText(input.userIntent) ?? defaultLongFormWordRange(input.channel);
}

export class LongFormGenerationError extends Error {
	readonly code: 'truncated_output' | 'word_count_out_of_range';
	readonly details: Record<string, unknown>;

	constructor(code: LongFormGenerationError['code'], message: string, details: Record<string, unknown> = {}) {
		super(message);
		this.name = 'LongFormGenerationError';
		this.code = code;
		this.details = details;
	}
}
