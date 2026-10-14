import type { GeneratedItemInput } from '../types';
import type { IdeaEngineItem } from './schemas';
import { postProcessIdeaEngineItem } from '@/lib/content/postProcessGeneration';

export function normalizeGeneratedItem(raw: IdeaEngineItem): GeneratedItemInput {
	const processed = postProcessIdeaEngineItem(raw);
	const postTitle = (processed.post_title || '').trim();
	const hook = (processed.hook || postTitle).trim();
	return {
		channel: raw.channel,
		post_title: postTitle || hook || null,
		post_type: raw.post_type ?? null,
		hook: hook || null,
		body_draft: processed.body_draft,
		hashtags: processed.hashtags ?? null,
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
