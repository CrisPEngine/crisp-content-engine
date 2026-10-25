import { CHANNELS } from '@/lib/channels/registry';
import type { ChannelId } from '@/lib/channels/types';

/** Normalise model JSON fields that may be string, array, or nested objects before trimming. */
export function coerceModelText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value == null) return '';
	if (Array.isArray(value)) {
		return value.map((item) => coerceModelText(item)).filter(Boolean).join('\n');
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.text === 'string') return record.text;
		if (typeof record.content === 'string') return record.content;
		if (typeof record.draft === 'string') return record.draft;
		if (typeof record.body === 'string') return record.body;
	}
	return String(value);
}

export function channelMaxChars(channel: string): number | null {
	const channelId = String(channel).toLowerCase() as ChannelId;
	return CHANNELS[channelId]?.constraints.maxCharsPerPost ?? null;
}

export function threadsDraftTargetMax(): number {
	return 400;
}

const SENTENCE_END = /[.!?](?:['")\]]?\s|$)/;

/** Last-resort trim at a sentence boundary inside the limit (never mid-word when avoidable). */
export function trimBodyAtSentenceBoundary(body: string, max: number): string {
	const trimmed = body.trim();
	if (!max || trimmed.length <= max) return trimmed;
	const window = trimmed.slice(0, max);
	const candidates = [
		window.lastIndexOf('?'),
		window.lastIndexOf('!'),
		window.lastIndexOf('.'),
	].filter((index) => index >= Math.floor(max * 0.45));
	const cut = candidates.length ? Math.max(...candidates) + 1 : -1;
	if (cut > 0) return window.slice(0, cut).trim();
	const lastSpace = window.lastIndexOf(' ');
	if (lastSpace > Math.floor(max * 0.5)) return window.slice(0, lastSpace).trim();
	return window.trimEnd();
}

export function bodyEndsCompleteSentence(body: string): boolean {
	const text = body.trim();
	if (!text) return false;
	return SENTENCE_END.test(text) || text.endsWith('#') || /#\w+$/.test(text);
}

export type TightenChannelBodyFn = (input: {
	channel: string;
	body: string;
	max: number;
	targetMax?: number;
	reason: string;
}) => Promise<string | null | undefined>;

export async function ensureBodyWithinChannelLimit(input: {
	channel: string;
	body: string;
	tighten?: TightenChannelBodyFn;
	maxPasses?: number;
}): Promise<{ body: string; adjusted: boolean; warnings: string[] }> {
	const max = channelMaxChars(input.channel);
	const warnings: string[] = [];
	let body = input.body.trim();
	if (!max || body.length <= max) {
		return { body, adjusted: false, warnings };
	}

	const targetMax =
		String(input.channel).toLowerCase() === 'threads' ? Math.min(threadsDraftTargetMax(), max) : max;
	const passes = input.maxPasses ?? 2;
	let adjusted = false;

	for (let attempt = 0; attempt < passes && body.length > max; attempt += 1) {
		if (!input.tighten) break;
		const reason = [
			`The post must be ${max} characters or fewer (target ${targetMax}).`,
			'Preserve voice and meaning.',
			'Keep a complete closing question and required hashtags or tags.',
			'Do not truncate mid-sentence.',
			`Current length: ${body.length}.`,
		].join(' ');
		const tightened = (await input.tighten({ channel: input.channel, body, max, targetMax, reason }))?.trim();
		if (!tightened || tightened.length >= body.length) break;
		body = tightened;
		adjusted = true;
	}

	if (body.length > max) {
		const boundary = trimBodyAtSentenceBoundary(body, max);
		if (boundary.length <= max && boundary.length < body.length) {
			warnings.push(
				`Body exceeded ${max} characters; tightened to ${boundary.length} at a sentence boundary after model passes.`,
			);
			body = boundary;
			adjusted = true;
		}
	}

	if (body.length > max) {
		warnings.push(`Body still exceeds ${max} characters after tightening (${body.length}).`);
	}

	return { body, adjusted, warnings };
}
