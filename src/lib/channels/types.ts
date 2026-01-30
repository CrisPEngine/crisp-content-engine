/**
 * Channel system types
 * 
 * Defines the structure for multi-channel content generation, validation, and publishing.
 */

export type ChannelId = 'linkedin' | 'x' | 'instagram' | 'facebook' | 'blog';
export type PostType = 'single' | 'thread' | 'caption';

export type ValidationError = {
	code: string;
	message: string;
	severity: 'block' | 'warn';
	canAutoRewrite?: boolean;
};

export type ValidationResult = 
	| { ok: true }
	| { ok: false; errors: ValidationError[] };

/**
 * Content draft shape (from AI generation)
 * This is what the generator outputs before Airtable mapping
 */
export type ContentDraft = {
	platform: string;
	post_type: PostType;
	hook: string;
	post_content: string;
	hashtags?: string;
	visual_brief?: string;
	thread_group_id?: string;
	thread_index?: number;
};

/**
 * Airtable-ready content item
 * This is what gets written to ContentQueue
 */
export type AirtableContentItem = {
	content_item_key: string;
	generation_job_id: string;
	platform: string;
	post_type: PostType;
	hook: string;
	post_content: string;
	hashtags?: string;
	visual_brief?: string;
	thread_group_id?: string | null;
	thread_index?: number | null;
	brand_profile_id: string;
	status: 'Needs Approval' | 'Needs Copy';
};

/**
 * Buffer publish payload (for future use)
 */
export type BufferPayload =
	| { kind: 'single'; text: string; profileId: string; scheduledAt?: string; idempotencyKey: string }
	| { kind: 'thread'; texts: string[]; profileId: string; scheduledAt?: string; idempotencyKey: string };

/**
 * Channel definition interface
 */
export interface ChannelDefinition {
	id: ChannelId;
	label: string;
	airtablePlatformValues: string[];
	supportedPostTypes: PostType[];
	defaultCadence: {
		recommendedPerDay: number;
		note?: string;
	};
	constraints: {
		maxCharsPerPost?: number;
		minCharsPerPost?: number;
		maxThreadLength?: number;
		minThreadLength?: number;
		requiresVisual?: boolean;
		allowsHashtags?: boolean;
		maxHashtags?: number;
	};

	/**
	 * Validate a content draft against channel constraints
	 */
	validate: (draft: ContentDraft) => ValidationResult;

	/**
	 * Attempt to auto-rewrite invalid content (one pass only)
	 * Returns rewritten draft or null if rewrite not applicable
	 */
	autoRewriteOnce?: (draft: ContentDraft, errors: ValidationError[]) => ContentDraft | null;

	/**
	 * Format content for UI preview
	 */
	formatForPreview: (draft: ContentDraft) => {
		title?: string;
		body: string;
		meta?: Record<string, any>;
	};
}

/**
 * Generation request from UI to API
 */
export type GenerationRequest = {
	brandProfileId: string;
	channels: Array<{
		platform: ChannelId;
		count: number;
	}>;
};

/**
 * Generation job payload sent to Make
 */
export type MakeGenerationPayload = {
	generation_job_id: string;
	request_id: string;
	user_id: string;
	brand_profile_id: string;
	channels: Array<{
		platform: string;
		count: number;
		keys: string[]; // Pre-generated content_item_key values
	}>;
	brand_voice_context: Record<string, any>;
	strategy_json?: Record<string, any>;
	x_algo_digest?: {
		version: string;
		bullets: string[];
		guardrails: {
			do: string[];
			dont: string[];
		};
	};
};

/**
 * Completion callback payload from Make to API
 */
export type MakeCompletionPayload = {
	generation_job_id: string;
	created: Record<string, number>; // { "LinkedIn": 3, "X": 10, ... }
	record_ids: string[]; // Airtable record IDs
};
