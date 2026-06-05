import 'server-only';

import type { LlmMessage } from '@/lib/llm';
import { IDEA_ENGINE_SYSTEM_PROMPT } from '@/lib/prompts/idea-engine-system';
import type { IdeaEngineRunContext } from '../types';
import { buildCtaOffersSection } from '../prompts/cta-offers';
import { formatBrandContextForPrompt } from '../prompts/formatBrandContext';
import { imagePromptInstructionForChannel } from '../prompts/image-prompt-schemas';

export type ChannelGenerationRequest = {
	channel: string;
	itemCount: number;
	seriesRunId: string;
	/** 1-based position of first item in this batch (for multi-call channel generation). */
	seriesPositionStart?: number;
	/** Total items for the channel across all batches. */
	seriesTotalForChannel?: number;
};

export function buildIdeaEnginePrompt(
	context: IdeaEngineRunContext,
	channelRequest: ChannelGenerationRequest,
): LlmMessage[] {
	const { channel, itemCount, seriesRunId } = channelRequest;
	const seriesTotal = channelRequest.seriesTotalForChannel ?? itemCount;
	const positionStart = channelRequest.seriesPositionStart ?? 1;
	const positionEnd = positionStart + itemCount - 1;
	const imageInstruction = imagePromptInstructionForChannel(channel);
	const ctaSection = buildCtaOffersSection(context.brandContext);
	const brandSection = formatBrandContextForPrompt(context.brandContext);

	const previousJson =
		context.previousContentJson.length > 0
			? JSON.stringify(context.previousContentJson, null, 2)
			: '[]';

	const outputSchema = `{
  "series_run_id": "${seriesRunId}",
  "items": [
    {
      "channel": "${channel}",
      "post_title": "hook/headline string",
      "post_type": "e.g. thought_leadership|story|tip|promo",
      "body_draft": "full post body",
      "hashtags": "optional hashtag string",
      "image_prompt": { },
      "series_position": ${positionStart},
      "series_total": ${seriesTotal}
    }
  ]
}`;

	const userContent = [
		'--- Generation task ---',
		`Channel: ${channel}`,
		`Items to generate: ${itemCount}`,
		`series_run_id: ${seriesRunId}`,
		`Goal: ${context.goal || 'Engagement'}`,
		`Publish mode: ${context.publishMode}`,
		`Timezone: ${context.timezone}`,
		context.postingWindows ? `Posting windows: ${JSON.stringify(context.postingWindows)}` : null,
		'',
		'--- User idea (verbatim) ---',
		context.idea,
		context.notes ? `\nNotes: ${context.notes}` : null,
		'',
		'--- Brand profile ---',
		brandSection,
		ctaSection ? `\n${ctaSection}` : null,
		'',
		'--- Previous content (deduplicate against this) ---',
		previousJson,
		'',
		'--- Image prompt schema for this channel ---',
		imageInstruction,
		'',
		'--- Required JSON output ---',
		`Generate exactly ${itemCount} item(s) for channel "${channel}".`,
		`Each item must have series_total=${seriesTotal} and series_position from ${positionStart} to ${positionEnd}.`,
		'Return JSON matching this structure:',
		outputSchema,
	]
		.filter(Boolean)
		.join('\n');

	return [
		{ role: 'system', content: IDEA_ENGINE_SYSTEM_PROMPT },
		{ role: 'user', content: userContent },
	];
}
