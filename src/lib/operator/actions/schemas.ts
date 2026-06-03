import { z } from 'zod';

export const operatorActionNameSchema = z.enum([
	'create_or_update_brand_profile',
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
	'fetch_brand_content_queue',
	'fetch_operator_logs',
]);

export type OperatorActionName = z.infer<typeof operatorActionNameSchema>;

const nonEmptyString = z.string().trim().min(1);
const optionalText = z.string().optional();

export const brandTypeSchema = z.enum(['company', 'personal']);
export const platformSchema = z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog']);
export const languageRegionSchema = z.enum(['US English', 'UK English', 'AU English']);
export const preferredImageSourceSchema = z.enum(['AI Generated', 'Stock', 'Brand']);

export const contentStatusSchema = z.enum([
	'Draft',
	'Needs Approval',
	'Needs Copy',
	'Needs Review',
	'Ready To Publish',
	'Scheduled',
	'Published',
	'Failed',
]);

export const brandProfileInputSchema = z.object({
	brand_type: brandTypeSchema.default('company'),
	client_name: optionalText,
	audience: optionalText,
	value_props: optionalText,
	offers: optionalText,
	brand_goals: optionalText,
	voice_rules: optionalText,
	brand_keywords: optionalText,
	exclude_keywords: optionalText,
	content_rules: optionalText,
	additional_info: optionalText,
	platforms_requested: z.array(platformSchema).optional(),
	timezone: optionalText,
	language_region: languageRegionSchema.optional(),
	preferred_image_source: preferredImageSourceSchema.optional(),
	website: z.string().url().optional().or(z.literal('')),
	brand_palette: optionalText,
	approval_contact_email: z.string().email().optional().or(z.literal('')),
	brand_assets_urls: z.array(z.string().url()).optional(),
	personal_full_name: optionalText,
	personal_job_title: optionalText,
	personal_industry: optionalText,
	personal_links: optionalText,
	personal_headline: optionalText,
	personal_audience: optionalText,
	personal_expertise: optionalText,
	personal_goals: optionalText,
	personal_voice_traits: z.array(z.string()).optional(),
	personal_risk_tolerance: z.string().optional(),
	personal_tone_avoid: z.array(z.string()).optional(),
	personal_content_style: z.array(z.string()).optional(),
	personal_exclude_keywords: optionalText,
	personal_story: optionalText,
	personal_assets_urls: z.array(z.string().url()).optional(),
	status: z.string().optional(),
	strategy_approval: z.boolean().optional(),
});

export const createOrUpdateBrandProfileInputSchema = z.object({
	brandProfileId: z.string().optional(),
	userId: nonEmptyString,
	profile: brandProfileInputSchema,
});

export const generateOrRefreshBrandStrategyInputSchema = z.object({
	brandProfileId: nonEmptyString,
	mode: z.enum(['initial', 'refresh']).optional().default('refresh'),
	strategyUpdateId: z.string().optional(),
	extraInstructions: optionalText,
});

export const generateContentBatchInputSchema = z.object({
	brandProfileId: nonEmptyString,
	userId: z.string().optional(),
	platform: platformSchema,
	strategyId: z.string().optional(),
	triggerType: z.enum(['strategy_confirmed', 'content_brief_approved', 'operator_requested']).optional().default('operator_requested'),
});

export const regenerateIndividualPostInputSchema = z.object({
	contentId: nonEmptyString,
	feedback: optionalText,
});

export const updateContentStatusInputSchema = z.object({
	contentId: nonEmptyString,
	status: contentStatusSchema,
	scheduledTime: z.string().datetime().optional().nullable(),
	notes: optionalText,
});

export const sendItemToApprovalInputSchema = z.object({
	contentId: nonEmptyString,
	notes: optionalText,
});

export const scheduleApprovedContentInputSchema = z.object({
	contentId: nonEmptyString,
	scheduledTime: z.string().datetime(),
});

export const fetchBrandContentQueueInputSchema = z.object({
	brandProfileId: z.string().optional(),
	statuses: z.array(contentStatusSchema).optional(),
	limit: z.number().int().min(1).max(100).optional().default(50),
});

export const fetchOperatorLogsInputSchema = z.object({
	action: operatorActionNameSchema.optional(),
	status: z.enum(['started', 'succeeded', 'failed']).optional(),
	limit: z.number().int().min(1).max(200).optional().default(50),
});

const actionEnvelopeBase = {
	dryRun: z.boolean().optional().default(false),
	idempotencyKey: z.string().optional(),
};

export const operatorActionRequestSchema = z.discriminatedUnion('action', [
	z.object({
		...actionEnvelopeBase,
		action: z.literal('create_or_update_brand_profile'),
		input: createOrUpdateBrandProfileInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('generate_or_refresh_brand_strategy'),
		input: generateOrRefreshBrandStrategyInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('generate_content_batch'),
		input: generateContentBatchInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('regenerate_individual_post'),
		input: regenerateIndividualPostInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('update_content_status'),
		input: updateContentStatusInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('send_item_to_approval'),
		input: sendItemToApprovalInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('schedule_approved_content'),
		input: scheduleApprovedContentInputSchema,
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('fetch_brand_content_queue'),
		input: fetchBrandContentQueueInputSchema.optional().default({ limit: 50 }),
	}),
	z.object({
		...actionEnvelopeBase,
		action: z.literal('fetch_operator_logs'),
		input: fetchOperatorLogsInputSchema.optional().default({ limit: 50 }),
	}),
]);

export const operatorActionResponseSchema = z.object({
	ok: z.boolean(),
	action: operatorActionNameSchema,
	dryRun: z.boolean(),
	actionLogId: z.string(),
	idempotentReplay: z.boolean().optional(),
	result: z.unknown().optional(),
	error: z.string().optional(),
	details: z.unknown().optional(),
});

export type OperatorActionRequest = z.infer<typeof operatorActionRequestSchema>;
export type OperatorActionResponse = z.infer<typeof operatorActionResponseSchema>;
export type CreateOrUpdateBrandProfileInput = z.infer<typeof createOrUpdateBrandProfileInputSchema>;
export type GenerateOrRefreshBrandStrategyInput = z.infer<typeof generateOrRefreshBrandStrategyInputSchema>;
export type GenerateContentBatchInput = z.infer<typeof generateContentBatchInputSchema>;
export type RegenerateIndividualPostInput = z.infer<typeof regenerateIndividualPostInputSchema>;
export type UpdateContentStatusInput = z.infer<typeof updateContentStatusInputSchema>;
export type SendItemToApprovalInput = z.infer<typeof sendItemToApprovalInputSchema>;
export type ScheduleApprovedContentInput = z.infer<typeof scheduleApprovedContentInputSchema>;
export type FetchBrandContentQueueInput = z.infer<typeof fetchBrandContentQueueInputSchema>;
export type FetchOperatorLogsInput = z.infer<typeof fetchOperatorLogsInputSchema>;
