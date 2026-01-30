export type PlanId = "creator" | "growth" | "pro" | "scale";

export type PlanCaps = {
	maxBrands: number;
	maxChannels: number;
	postsPerMonth: number | "unlimited";
	includedImageGen: boolean;
	includedPlatforms: ("linkedin"|"instagram"|"facebook"|"x"|"blog"|"medium")[];
	notes?: string;
};

export const CAPS: Record<PlanId, PlanCaps> = {
	creator: {
		maxBrands: 1,
		maxChannels: 2,
		postsPerMonth: 10,
		includedImageGen: false,
		includedPlatforms: ["linkedin","blog","medium"],
		notes: "LinkedIn + Blog (Medium cross-post).",
	},
	growth: {
		maxBrands: 1,
		maxChannels: 6,
		postsPerMonth: 150,
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
	},
	pro: {
		maxBrands: 5,
		maxChannels: 20,
		postsPerMonth: 500,
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
	},
	scale: {
		maxBrands: 20,
		maxChannels: 60,
		postsPerMonth: "unlimited",
		includedImageGen: true,
		includedPlatforms: ["linkedin","instagram","facebook","x","blog","medium"],
		notes: "Agency features incl. white-label & API.",
	},
};

export const PRICING = {
	order: ["creator","growth","pro","scale"] as PlanId[],
	monthly: {
		creator: {
			name: "Creator",
			priceText: "$19/mo",
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
			blurb: "3 channels across 2 brands. Ship consistently.",
			features: [
				"2 brand workspaces",
				"Any 3 channels/brand (LI/IG/FB/X + Blog/Medium)",
				"60 posts/month",
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
		creator: {
			name: "Creator",
			priceText: "$190/yr",
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
				"Any 3 channels/brand",
				"60 posts/month",
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
	// Creator
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


