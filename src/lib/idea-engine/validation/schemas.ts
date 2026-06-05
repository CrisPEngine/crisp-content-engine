import { z } from 'zod';

export const CHANNEL_ENUM = z.enum(['LinkedIn', 'X', 'Blog', 'Instagram', 'Facebook']);

const imagePromptObjectSchema = z.record(z.string(), z.unknown());

export const ideaEngineItemSchema = z
	.object({
		channel: CHANNEL_ENUM,
		post_title: z.string().optional(),
		post_type: z.string().optional(),
		hook: z.string().optional(),
		body_draft: z.string().min(1, 'body_draft is required'),
		hashtags: z.string().optional(),
		image_prompt: z.union([imagePromptObjectSchema, z.string()]).optional(),
		series_position: z.number().int().positive(),
		series_total: z.number().int().positive(),
		scheduled_time: z.string().datetime().optional(),
	})
	.passthrough();

export const ideaEngineChannelResponseSchema = z.object({
	series_run_id: z.string().uuid().optional(),
	items: z.array(ideaEngineItemSchema).min(1),
});

export const ideaEngineResponseSchema = z.object({
	series_run_id: z.string().uuid(),
	items: z.array(ideaEngineItemSchema).min(1),
});

export type IdeaEngineItem = z.infer<typeof ideaEngineItemSchema>;
export type IdeaEngineResponse = z.infer<typeof ideaEngineResponseSchema>;
