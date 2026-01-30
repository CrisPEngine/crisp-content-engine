/**
 * Payload type sent to MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL.
 * Includes onboarding, strategy, monthly brief, dedupe, and scheduling context.
 */

export type MultiChannelMakePayload = {
	// A. Identifiers
	generation_job_id: string;
	request_id: string;
	user_id: string;
	brand_profile_id: string;

	// B. Channel request list
	channels: Array<{
		platform: 'LinkedIn' | 'X' | 'Instagram' | 'Facebook' | 'Blog';
		count: number;
		keys: string[];
	}>;

	// C. Brand onboarding context (all known BrandProfiles fields)
	brand_voice_context: BrandVoiceContext;

	// D. Approved strategy
	strategy_json: Record<string, unknown> | null;
	strategy_summary: string | null;

	// E. Monthly brief (nullable)
	monthly_brief: MonthlyBrief | null;

	// F. Dedupe inputs
	previous_content_json: PreviousContentItem[];

	// G. Scheduling context (do not ask OpenAI to schedule)
	scheduling_context: SchedulingContext;

	// H. X algo digest
	x_algo_digest: {
		version: string;
		bullets: string[];
		guardrails: { do: string[]; dont: string[] };
	};

	triggered_at: string;
};

export type BrandVoiceContext = {
	client_name: string | null;
	brand_type: string | null;
	timezone: string | null;
	website: string | null;
	audience: string | null;
	value_props: string | null;
	offers: string | null;
	brand_tone: string | null;
	brand_keywords: string | null;
	exclude_keywords: string | null;
	content_rules: string | null;
	voice_rules: string | null;
	compliance_notes: string | null;
	language_region: string | null;
	spelling_variant: string | null;
	posting_windows: string | unknown[] | null;
	platforms_requested: string[] | null;
	risk_tolerance: string | null;
	tone_avoid: string[] | null;
	personal_voice_traits: string[] | null;
	personal_content_style: string[] | null;
	// Additional known fields
	brand_goals?: string | null;
	additional_info?: string | null;
	preferred_image_source?: string | null;
	// Personal brand (if brand_type === 'personal')
	personal_full_name?: string | null;
	personal_job_title?: string | null;
	personal_industry?: string | null;
	personal_links?: string | null;
	personal_headline?: string | null;
	personal_audience?: string | null;
	personal_expertise?: string | null;
	personal_goals?: string | null;
	personal_story?: string | null;
};

export type MonthlyBrief = {
	objective: string | null;
	themes_focus: string | null;
	key_dates: string | null;
	feedback_notes: string | null;
	content_preferences: string | null;
	primary_goal: string | null;
	success_metric: string | null;
	cycle_label: string | null;
	cycle_start_date: string | null;
	cta: string | null;
	cta_link: string | null;
	offers_to_push: string | null;
	topics_to_avoid_this_month: string | null;
	competitor_or_inspo_links: string | null;
	best_post: { title: string; body_draft: string; reason: string } | null;
	worst_post: { title: string; body_draft: string; reason: string } | null;
};

export type PreviousContentItem = {
	platform: string;
	hook: string;
	post_type?: string;
	topic_bucket?: string | null;
	created_time: string;
	one_line_summary?: string | null;
};

export type SchedulingContext = {
	timezone: string;
	posting_windows: string | unknown[] | null;
	cadence_defaults?: {
		LinkedIn?: number;
		X?: number;
		Instagram?: number;
		Facebook?: number;
		Blog?: number;
	};
	now_iso: string;
};
