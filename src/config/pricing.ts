export type PlanId = "trial" | "starter" | "creator" | "growth" | "pro" | "scale";

/** Max content pieces per channel in a single multi-channel generation request */
export const PER_CHANNEL_REQUEST_CAPS: Record<string, number> = {
	blog: 2,
	facebook: 3,
	instagram: 3,
	linkedin: 3,
	x: 10,
};

export type PlanCaps = {
	maxBrands: number;
	maxChannels: number;
	postsPerMonth: number | "unlimited";
	includedImageGen: boolean;
	includedPlatforms: ("linkedin"|"instagram"|"facebook"|"x"|"blog"|"medium")[];
	autopublishLinkedIn?: boolean;
	autopublishMeta?: boolean;
	perChannelLimits?: {
		linkedin?: number;
		x?: number;
		blog?: number;
	};
	notes?: string;
};

export const CAPS: Record<PlanId, PlanCaps> = {
	trial: {
		maxBrands: 1,
		maxChannels: 2,
		postsPerMonth: 6,
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x"],
		autopublishLinkedIn: false,
		autopublishMeta: false,
		perChannelLimits: {
			linkedin: 3,
			x: 3,
			blog: 0,
		},
		notes: "7-day trial: 3 LinkedIn + 3 X posts (export-only). No autopublish, no blogs.",
	},
	starter: {
		maxBrands: 1,
		maxChannels: 2,
		postsPerMonth: 16,
		includedImageGen: true,
		includedPlatforms: ["linkedin", "x"],
		autopublishLinkedIn: false,
		autopublishMeta: false,
		perChannelLimits: {
			linkedin: 8,
			x: 8,
			blog: 0,
		},
		notes: "Export-only LinkedIn (8) + X (8). No autopublish, no blogs.",
	},
	creator: {
		maxBrands: 1,
		maxChannels: 2,
		postsPerMonth: 10,
		includedImageGen: false,
		includedPlatforms: ["linkedin","blog","medium"],
		autopublishLinkedIn: true,
		autopublishMeta: false,
		perChannelLimits: {
			linkedin: 8,
			blog: 2,
		},
		notes: "LinkedIn autopublish (8) + Blog (2).",
	},
	growth: {
		maxBrands: 1,
		maxChannels: 6,
		postsPerMonth: 150,
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
	},
	pro: {
		maxBrands: 5,
		maxChannels: 20,
		postsPerMonth: 500,
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
	},
	scale: {
		maxBrands: 20,
		maxChannels: 60,
		postsPerMonth: "unlimited",
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
		autopublishLinkedIn: true,
		autopublishMeta: true,
		notes: "Agency features incl. white-label & API.",
	},
};

export const PRICING = {
	order: ["starter","creator","growth","pro","scale"] as PlanId[],
	monthly: {
		starter: {
			name: "Starter",
			priceText: "$5/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY!,
			blurb: "Export-only LinkedIn and X posts. Perfect for manual publishers.",
			features: [
				"8 LinkedIn posts (export-only)",
				"8 X posts (export-only)",
				"AI image prompts included",
				"One-click copy & export",
				"No autopublish (manual posting)",
			],
		},
	creator: {
		name: "Creator",
		priceText: "$9/mo",
		priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY!,
		blurb: "Automated LinkedIn posting plus ready-to-publish blog articles.",
		features: [
			"8 auto-published LinkedIn posts",
			"2 long-form blog for you to self-publish",
			"Personal brand onboarding",
			"Manual blog export (Word/PDF/Markdown)",
			"LinkedIn connection required",
		],
	},
		growth: {
			name: "Growth",
			priceText: "$49/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_MONTHLY!,
			blurb: "Multi-channel with LinkedIn + Meta autopublish. Ship consistently.",
			features: [
				"2 brand workspaces",
				"Any 3 channels/brand (LinkedIn, Facebook, Instagram, X, Blog, Medium)",
				"LinkedIn + Facebook + Instagram autopublish",
				"150 posts/month",
				"Image generation included",
			],
		},
		pro: {
			name: "Pro",
			priceText: "$149/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY!,
			blurb: "For teams running multi-brand, multi-channel.",
			features: [
				"5 brand workspaces",
				"Up to 20 channels total",
				"500 posts/month",
				"Image generation included",
			],
		},
		scale: {
			name: "Scale",
			priceText: "$399/mo",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_MONTHLY!,
			blurb: "Agencies managing many brands and channels.",
			features: [
				"20 brand workspaces",
				"Up to 60 channels total",
				"Unlimited posts/month",
				"White-label & API access",
			],
		},
	},
	annual: {
		starter: {
			name: "Starter",
			priceText: "$50/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL!,
			blurb: "Save 20% billed yearly.",
			features: [
				"8 LinkedIn posts (export-only)",
				"8 X posts (export-only)",
				"AI image prompts included",
				"One-click copy & export",
				"No autopublish (manual posting)",
			],
		},
	creator: {
		name: "Creator",
		priceText: "$90/yr",
		priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL!,
		blurb: "Save 20% billed yearly.",
		features: [
			"8 auto-published LinkedIn posts",
			"2 long-form blog for you to self-publish",
			"Personal brand onboarding",
			"Manual blog export (Word/PDF/Markdown)",
			"LinkedIn connection required",
		],
	},
		growth: {
			name: "Growth",
			priceText: "$490/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ANNUAL!,
			blurb: "Save 20% billed yearly.",
			features: [
				"2 brand workspaces",
				"Any 3 channels/brand (LinkedIn, Facebook, Instagram, X, Blog, Medium)",
				"LinkedIn + Facebook + Instagram autopublish",
				"150 posts/month",
				"Image generation included",
			],
		},
		pro: {
			name: "Pro",
			priceText: "$1,490/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL!,
			blurb: "Save 20% billed yearly.",
			features: [
				"5 brand workspaces",
				"Up to 20 channels total",
				"500 posts/month",
				"Image generation included",
			],
		},
		scale: {
			name: "Scale",
			priceText: "$3,990/yr",
			priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE_ANNUAL!,
			blurb: "Save 20% billed yearly.",
			features: [
				"20 brand workspaces",
				"Up to 60 channels total",
				"Unlimited posts/month",
				"White-label & API access",
			],
		},
	},
};

export const PRICE_TO_PLAN: Record<string, { plan: PlanId; cycle: "monthly"|"annual"; }> = {
	// Starter
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY ? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY]: { plan: "starter" as const, cycle: "monthly" as const } } : {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL ? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL]: { plan: "starter" as const, cycle: "annual" as const } } : {}),
	// Creator (new $9/mo pricing)
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY ? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY]: { plan: "creator" as const, cycle: "monthly" as const } } : {}),
	...(process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL ? { [process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL]: { plan: "creator" as const, cycle: "annual" as const } } : {}),
	// Creator (legacy $19/mo pricing - kept for backward compatibility)
	"price_1SPjYEK763RD3TkNNi3ov5Ep": { plan: "creator", cycle: "monthly" },
	"price_1SPjrTK763RD3TkNS1tQPWdF": { plan: "creator", cycle: "annual" },
	// Growth
	"price_1SPjdxK763RD3TkNdDIE1ZlQ": { plan: "growth", cycle: "monthly" },
	"price_1SPjw4K763RD3TkN0Mq1mLKv": { plan: "growth", cycle: "annual" },
	// Pro
	"price_1SPjidK763RD3TkNaIU3wgYn": { plan: "pro", cycle: "monthly" },
	"price_1SPk2WK763RD3TkND7iPZifZ": { plan: "pro", cycle: "annual" },
	// Scale
	"price_1SPjlgK763RD3TkNPo6Z1kJp": { plan: "scale", cycle: "monthly" },
	"price_1SPk5SK763RD3TkNVXNPFHk6": { plan: "scale", cycle: "annual" },
};


