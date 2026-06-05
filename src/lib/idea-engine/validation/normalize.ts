import type { GeneratedItemInput } from '../types';
import type { IdeaEngineItem } from './schemas';

export function normalizeGeneratedItem(raw: IdeaEngineItem): GeneratedItemInput {
	const postTitle = (raw.post_title || '').trim();
	const hook = (raw.hook || postTitle).trim();
	return {
		channel: raw.channel,
		post_title: postTitle || hook || null,
		post_type: raw.post_type ?? null,
		hook: hook || null,
		body_draft: raw.body_draft,
		hashtags: raw.hashtags ?? null,
		image_prompt: raw.image_prompt ?? null,
		series_position: raw.series_position,
		series_total: raw.series_total,
		scheduled_time: raw.scheduled_time ?? null,
	};
}

export function serializeImagePrompt(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
