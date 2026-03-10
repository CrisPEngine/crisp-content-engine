export type PlanId = "starter" | "creator" | "growth" | "pro" | "scale";

/** Max content pieces per channel in a single multi-channel generation request */
export const PER_CHANNEL_REQUEST_CAPS: Record<string, number> = {
	blog: 2,
	facebook: 3,
	instagram: 3,
	// Starter needs to generate 4 LinkedIn posts in one go
	linkedin: 4,
	x: 10,
};

export type PlanCaps = {
	maxBrands: number;
	maxSeats: number;
	maxChannels: number;
	// Global monthly cap (sum of all channels; kept for backward compat with entitlements table)
	postsPerMonth: number | "unlimited";
	includedImageGen: boolean;
	includedPlatforms: ("linkedin" | "instagram" | "facebook" | "x" | "blog" | "medium")[];
	autopublishLinkedIn: boolean;
	autopublishMeta: boolean;
	// Per-channel monthly quotas (authoritative limits)
	linkedinPostsMonthly: number;
	xPostsMonthly: number;
	blogArticlesMonthly: number;
	blogOutlinesMonthly: number; // Starter only; paid plans use blogArticlesMonthly
	metaPoolMonthly: number; // Shared across Facebook + Instagram
	// Which Make scenario to use
	makeScenario: "starter" | "multi-channel";
	// Idea Engine entitlements
	ideaEngineEnabled: boolean;
	// Monthly series run limit; 0 = unlimited
	ideaEngineRunsMonthly: number;
	// Legacy per-channel limits object (used by enforcement helpers)
	perChannelLimits?: {
		linkedin?: number;
		x?: number;
		blog?: number;
		meta_pool?: number;
	};
	notes?: string;
};

export const CAPS: Record<PlanId, PlanCaps> = {
	starter: {
		maxBrands: 1,
		maxSeats: 1,
		maxChannels: 3,
		postsPerMonth: 9, // 4 LinkedIn + 4 𝕏 + 1 blog article
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x", "blog"],
		autopublishLinkedIn: false,
		autopublishMeta: false,
		linkedinPostsMonthly: 4,
		xPostsMonthly: 4,
		blogArticlesMonthly: 1,
		blogOutlinesMonthly: 0,
		metaPoolMonthly: 0,
		makeScenario: "starter",
		ideaEngineEnabled: false,
		ideaEngineRunsMonthly: 0,
		perChannelLimits: { linkedin: 4, x: 4, blog: 1 },
		notes: "Free Forever. Export-only LinkedIn (4) + 𝕏 (4) + 1 blog article. Mini AI via Starter scenario.",
	},
	creator: {
		maxBrands: 1,
		maxSeats: 1,
		maxChannels: 3,
		postsPerMonth: 26, // 12 LinkedIn + 12 𝕏 + 2 blog
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x", "blog"],
		autopublishLinkedIn: true,
		autopublishMeta: false,
		linkedinPostsMonthly: 12,
		xPostsMonthly: 12,
		blogArticlesMonthly: 2,
		blogOutlinesMonthly: 0,
		metaPoolMonthly: 0,
		makeScenario: "multi-channel",
		ideaEngineEnabled: true,
		ideaEngineRunsMonthly: 3,
		perChannelLimits: { linkedin: 12, x: 12, blog: 2 },
		notes: "LinkedIn autopublish (12) + 𝕏 export (12) + Blog export (2).",
	},
	growth: {
		maxBrands: 1,
		maxSeats: 1,
		maxChannels: 5,
		postsPerMonth: 84, // 20 LinkedIn + 40 𝕏 + 4 blog + 20 meta pool
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x", "blog", "instagram", "facebook"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
		linkedinPostsMonthly: 20,
		xPostsMonthly: 40,
		blogArticlesMonthly: 4,
		blogOutlinesMonthly: 0,
		metaPoolMonthly: 20,
		makeScenario: "multi-channel",
		ideaEngineEnabled: true,
		ideaEngineRunsMonthly: 0, // unlimited
		perChannelLimits: { linkedin: 20, x: 40, blog: 4, meta_pool: 20 },
		notes: "1 brand, up to 5 channels. LinkedIn + Meta autopublish.",
	},
	pro: {
		maxBrands: 3,
		maxSeats: 2,
		maxChannels: 5,
		postsPerMonth: 312, // 75 LinkedIn + 150 𝕏 + 12 blog + 75 meta pool
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x", "blog", "instagram", "facebook"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
		linkedinPostsMonthly: 75,
		xPostsMonthly: 150,
		blogArticlesMonthly: 12,
		blogOutlinesMonthly: 0,
		metaPoolMonthly: 75,
		makeScenario: "multi-channel",
		ideaEngineEnabled: true,
		ideaEngineRunsMonthly: 0, // unlimited
		perChannelLimits: { linkedin: 75, x: 150, blog: 12, meta_pool: 75 },
		notes: "3 brands, 2 seats. Multi-brand operators and agencies.",
	},
	scale: {
		// Custom plan: all limits are negotiated, use high sentinels so no code path hard-blocks.
		// Do NOT enforce these numbers in UI — display "Custom" everywhere for Scale.
		maxBrands: 999,
		maxSeats: 999,
		maxChannels: 999,
		postsPerMonth: "unlimited",
		includedImageGen: true,
		includedPlatforms: ["linkedin", "instagram", "facebook", "x", "blog", "medium"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
		linkedinPostsMonthly: 999999,
		xPostsMonthly: 999999,
		blogArticlesMonthly: 999999,
		blogOutlinesMonthly: 0,
		metaPoolMonthly: 999999,
		makeScenario: "multi-channel",
		ideaEngineEnabled: true,
		ideaEngineRunsMonthly: 0, // unlimited
		notes: "Contact sales. All limits are custom and agreed per contract.",
	},
};

/**
 * Default number of posts Idea Engine generates per channel.
 * Make returns the actual counts; these are used for UI preview only.
 */
export const IDEA_ENGINE_DEFAULTS: Record<string, number> = {
	linkedin: 3,
	x: 4,
	blog: 1,
	instagram: 2,
	facebook: 2,
};

export const PRICING = {
	order: ["starter", "creator", "growth", "pro", "scale"] as PlanId[],
	monthly: {
		starter: {
			name: "Starter",
			priceText: "Free",
			priceId: "", // No Stripe price — free forever
			blurb: "For founders getting consistent with structure.",
			features: [
				"4 LinkedIn posts per month (export)",
				"4 𝕏 posts per month (export)",
				"1 blog outline per month (export)",
				"AI image prompts included",
				"Manual posting",
			],
			comingSoon: [] as string[],
			cta: "Start free",
			footnote: "Uses efficient generation to keep Free sustainable. No credit card required.",
		},
		creator: {
			name: "Creator",
			priceText: "$15/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY!,
			blurb: "For solo operators who want LinkedIn on autopilot.",
			features: [
				"12 LinkedIn posts per month (auto-publish)",
				"12 𝕏 posts per month (export)",
				"2 blog articles per month (export)",
				"Brand onboarding",
				"AI image prompts included",
			],
			comingSoon: ["Single idea briefing", "Comment engine"] as string[],
			cta: "Upgrade to Creator",
		},
		growth: {
			name: "Growth",
			priceText: "$29/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY!,
			blurb: "For serious visibility across every core channel.",
			features: [
				"20 LinkedIn posts per month (auto-publish)",
				"40 𝕏 posts per month (export)",
				"4 blog articles per month (export)",
				"20 Meta posts per month (shared Facebook + Instagram, auto-publish)",
				"One brand, up to 5 channels",
			],
			comingSoon: ["Single idea briefing", "Comment engine", "Analytics layer"] as string[],
			cta: "Upgrade to Growth",
		},
		pro: {
			name: "Pro",
			priceText: "$49/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY!,
			blurb: "For multi-brand operators and agencies running volume.",
			features: [
				"75 LinkedIn posts per month (auto-publish)",
				"150 𝕏 posts per month (export)",
				"12 blog articles per month (export)",
				"75 Meta posts per month (shared Facebook + Instagram, auto-publish)",
				"Up to 3 brands",
				"Additional seat included (coming soon)",
			],
			comingSoon: ["Presence score and reporting"] as string[],
			cta: "Upgrade to Pro",
		},
		scale: {
			name: "Scale",
			priceText: "From $99/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY!,
			blurb: "For teams and agencies that need custom limits and support.",
			features: [
				"Custom brands, limits and seats",
				"Onboarding and priority support",
			],
			comingSoon: [] as string[],
			cta: "Email enquiries@crispdigital.io",
		},
	},
	annual: {
		starter: {
			name: "Starter",
			priceText: "Free",
			priceId: "",
			blurb: "For founders getting consistent with structure.",
			features: [
				"4 LinkedIn posts per month (export)",
				"4 𝕏 posts per month (export)",
				"1 blog outline per month (export)",
				"AI image prompts included",
				"Manual posting",
			],
			comingSoon: [] as string[],
			cta: "Start free",
			footnote: "Uses efficient generation to keep Free sustainable. No credit card required.",
		},
		creator: {
			name: "Creator",
			priceText: "$144/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL!,
			blurb: "Save 20% billed yearly. LinkedIn on autopilot.",
			features: [
				"12 LinkedIn posts per month (auto-publish)",
				"12 𝕏 posts per month (export)",
				"2 blog articles per month (export)",
				"Brand onboarding",
				"AI image prompts included",
			],
			comingSoon: ["Single idea briefing", "Comment engine"] as string[],
			cta: "Upgrade to Creator",
		},
		growth: {
			name: "Growth",
			priceText: "$279/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL!,
			blurb: "Save 20% billed yearly. Serious visibility across every core channel.",
			features: [
				"20 LinkedIn posts per month (auto-publish)",
				"40 𝕏 posts per month (export)",
				"4 blog articles per month (export)",
				"20 Meta posts per month (shared Facebook + Instagram, auto-publish)",
				"One brand, up to 5 channels",
			],
			comingSoon: ["Single idea briefing", "Comment engine", "Analytics layer"] as string[],
			cta: "Upgrade to Growth",
		},
		pro: {
			name: "Pro",
			priceText: "$470/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL!,
			blurb: "Save 20% billed yearly. Multi-brand operators and agencies.",
			features: [
				"75 LinkedIn posts per month (auto-publish)",
				"150 𝕏 posts per month (export)",
				"12 blog articles per month (export)",
				"75 Meta posts per month (shared Facebook + Instagram, auto-publish)",
				"Up to 3 brands",
				"Additional seat included (coming soon)",
			],
			comingSoon: ["Presence score and reporting"] as string[],
			cta: "Upgrade to Pro",
		},
		scale: {
			name: "Scale",
			priceText: "From $99/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL!,
			blurb: "For teams and agencies that need custom limits and support.",
			features: [
				"Custom brands, limits and seats",
				"Onboarding and priority support",
			],
			comingSoon: [] as string[],
			cta: "Email enquiries@crispdigital.io",
		},
	},
};

export const PRICE_TO_PLAN: Record<string, { plan: PlanId; cycle: "monthly" | "annual" }> = {
	// Creator
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY]: { plan: "creator" as const, cycle: "monthly" as const } }
		: {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL]: { plan: "creator" as const, cycle: "annual" as const } }
		: {}),
	// Creator legacy price IDs (kept for backward compat with existing subscribers)
	"price_1SPjYEK763RD3TkNNi3ov5Ep": { plan: "creator", cycle: "monthly" },
	"price_1SPjrTK763RD3TkNS1tQPWdF": { plan: "creator", cycle: "annual" },
	// Growth
	"price_1SPjdxK763RD3TkNdDIE1ZlQ": { plan: "growth", cycle: "monthly" },
	"price_1SPjw4K763RD3TkN0Mq1mLKv": { plan: "growth", cycle: "annual" },
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY]: { plan: "growth" as const, cycle: "monthly" as const } }
		: {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL]: { plan: "growth" as const, cycle: "annual" as const } }
		: {}),
	// Pro
	"price_1SPjidK763RD3TkNaIU3wgYn": { plan: "pro", cycle: "monthly" },
	"price_1SPk2WK763RD3TkND7iPZifZ": { plan: "pro", cycle: "annual" },
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY]: { plan: "pro" as const, cycle: "monthly" as const } }
		: {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL]: { plan: "pro" as const, cycle: "annual" as const } }
		: {}),
	// Scale
	"price_1SPjlgK763RD3TkNPo6Z1kJp": { plan: "scale", cycle: "monthly" },
	"price_1SPk5SK763RD3TkNVXNPFHk6": { plan: "scale", cycle: "annual" },
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY]: { plan: "scale" as const, cycle: "monthly" as const } }
		: {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL
		? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL]: { plan: "scale" as const, cycle: "annual" as const } }
		: {}),
};
