import type { GeneratedItemInput } from '../types';
import type { IdeaEngineItem } from './schemas';
import { postProcessIdeaEngineItem } from '@/lib/content/postProcessGeneration';
import { parseSocialProductionDraft } from '@/lib/content/socialPublishBody';

export function normalizeGeneratedItem(raw: IdeaEngineItem): GeneratedItemInput {
	const processed = postProcessIdeaEngineItem(raw);
	const postTitle = (processed.post_title || '').trim();
	const hook = (processed.hook || postTitle).trim();
	const parsedBody = parseSocialProductionDraft(processed.body_draft ?? '');
	let imagePrompt = raw.image_prompt ?? null;
	if (parsedBody.hadProductionSections) {
		if (parsedBody.visualBrief && !imagePrompt) {
			imagePrompt = parsedBody.visualBrief;
		} else if (parsedBody.visualBrief && typeof imagePrompt === 'string' && !imagePrompt.includes(parsedBody.visualBrief.slice(0, 40))) {
			imagePrompt = `${imagePrompt}\n\n${parsedBody.visualBrief}`.trim();
		}
	}
	return {
		channel: raw.channel,
		post_title: postTitle || hook || null,
		post_type: raw.post_type ?? null,
		hook: hook || null,
		body_draft: parsedBody.publishableBody,
		hashtags: processed.hashtags ?? null,
		image_prompt: imagePrompt,
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
