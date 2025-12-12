/**
 * Master Strategy Schema
 * 
 * TypeScript interfaces for strategy_json structure
 * Supports flexible JSON from Make.com while providing structured editing
 */

export interface ContentPillar {
	id: string;
	title: string;
	description: string;
	topics?: string[];
}

export interface PlatformCadence {
	platform: string;
	postsPerWeek?: number;
	postingDays?: string[];
	bestTimes?: string[];
	contentTypes?: string[];
}

export interface VoiceAndTone {
	voice_rules?: string;
	tone?: string;
	personality?: string[];
	style_guidelines?: string;
}

export interface Guardrails {
	brand_keywords?: string[];
	exclude_keywords?: string[];
	content_rules?: string;
	topics_to_avoid?: string[];
	risk_tolerance?: string;
}

export interface BrandPositioning {
	brand_name?: string;
	audience?: string;
	value_props?: string;
	brand_goals?: string;
	offers?: string;
	industry?: string;
	positioning_statement?: string;
}

export interface MasterStrategy {
	// Brand & Positioning
	brand?: BrandPositioning;
	brand_name?: string;
	audience?: string;
	value_props?: string;
	brand_goals?: string;
	offers?: string;
	industry?: string;
	positioning_statement?: string;
	
	// Voice & Tone
	voice?: VoiceAndTone;
	voice_rules?: string;
	tone?: string;
	personality?: string[];
	style_guidelines?: string;
	
	// Content Pillars
	pillars?: ContentPillar[];
	content_pillars?: ContentPillar[];
	
	// Platform Cadence
	platform_cadence?: PlatformCadence[];
	cadence?: PlatformCadence[];
	platforms?: {
		[key: string]: {
			postsPerWeek?: number;
			postingDays?: string[];
			bestTimes?: string[];
		};
	};
	
	// Guardrails
	guardrails?: Guardrails;
	brand_keywords?: string[];
	exclude_keywords?: string[];
	content_rules?: string;
	topics_to_avoid?: string[];
	risk_tolerance?: string;
	
	// Additional fields (flexible for Make.com variations)
	[key: string]: any;
}

/**
 * Parse strategy_json into structured form state
 */
export function parseStrategyJson(strategyJson: any): MasterStrategy {
	if (!strategyJson) {
		return {
			brand: {},
			voice: {},
			pillars: [],
			platform_cadence: [],
			guardrails: {},
		};
	}

	// Handle string JSON
	let parsed: any;
	if (typeof strategyJson === 'string') {
		try {
			parsed = JSON.parse(strategyJson);
		} catch {
			return {
				brand: {},
				voice: {},
				pillars: [],
				platform_cadence: [],
				guardrails: {},
			};
		}
	} else {
		parsed = strategyJson;
	}

	// Normalize structure - handle various Make.com formats
	const strategy: MasterStrategy = {
		// Brand & Positioning
		brand: parsed.brand || {
			brand_name: parsed.brand_name || '',
			audience: parsed.audience || '',
			value_props: parsed.value_props || '',
			brand_goals: parsed.brand_goals || '',
			offers: parsed.offers || '',
			industry: parsed.industry || parsed.personal_industry || '',
			positioning_statement: parsed.positioning_statement || '',
		},
		brand_name: parsed.brand_name || parsed.brand?.brand_name || '',
		audience: parsed.audience || parsed.brand?.audience || '',
		value_props: parsed.value_props || parsed.brand?.value_props || '',
		brand_goals: parsed.brand_goals || parsed.brand?.brand_goals || '',
		offers: parsed.offers || parsed.brand?.offers || '',
		industry: parsed.industry || parsed.personal_industry || parsed.brand?.industry || '',
		positioning_statement: parsed.positioning_statement || parsed.brand?.positioning_statement || '',

		// Voice & Tone
		voice: parsed.voice || {
			voice_rules: parsed.voice_rules || '',
			tone: parsed.tone || '',
			personality: parsed.personality || parsed.personal_voice_traits || [],
			style_guidelines: parsed.style_guidelines || '',
		},
		voice_rules: parsed.voice_rules || parsed.voice?.voice_rules || '',
		tone: parsed.tone || parsed.voice?.tone || '',
		personality: parsed.personality || parsed.personal_voice_traits || parsed.voice?.personality || [],
		style_guidelines: parsed.style_guidelines || parsed.voice?.style_guidelines || '',

		// Content Pillars - ensure always arrays
		pillars: Array.isArray(parsed.pillars) 
			? parsed.pillars 
			: (Array.isArray(parsed.content_pillars) ? parsed.content_pillars : []),
		content_pillars: Array.isArray(parsed.content_pillars) 
			? parsed.content_pillars 
			: (Array.isArray(parsed.pillars) ? parsed.pillars : []),

		// Platform Cadence - ensure always arrays
		platform_cadence: Array.isArray(parsed.platform_cadence) 
			? parsed.platform_cadence 
			: (Array.isArray(parsed.cadence) ? parsed.cadence : []),
		cadence: Array.isArray(parsed.cadence) 
			? parsed.cadence 
			: (Array.isArray(parsed.platform_cadence) ? parsed.platform_cadence : []),

		// Guardrails
		guardrails: parsed.guardrails || {
			brand_keywords: parsed.brand_keywords || [],
			exclude_keywords: parsed.exclude_keywords || parsed.personal_exclude_keywords || [],
			content_rules: parsed.content_rules || '',
			topics_to_avoid: parsed.topics_to_avoid || [],
			risk_tolerance: parsed.risk_tolerance || parsed.personal_risk_tolerance || '',
		},
		brand_keywords: Array.isArray(parsed.brand_keywords) 
			? parsed.brand_keywords 
			: (parsed.brand_keywords ? parsed.brand_keywords.split(',').map((k: string) => k.trim()) : []),
		exclude_keywords: Array.isArray(parsed.exclude_keywords) 
			? parsed.exclude_keywords 
			: (parsed.exclude_keywords ? parsed.exclude_keywords.split(',').map((k: string) => k.trim()) : []),
		content_rules: parsed.content_rules || parsed.guardrails?.content_rules || '',
		topics_to_avoid: parsed.topics_to_avoid || parsed.guardrails?.topics_to_avoid || [],
		risk_tolerance: parsed.risk_tolerance || parsed.personal_risk_tolerance || parsed.guardrails?.risk_tolerance || '',

		// Preserve any additional fields
		...Object.keys(parsed).reduce((acc, key) => {
			if (!['brand', 'voice', 'pillars', 'content_pillars', 'platform_cadence', 'cadence', 'guardrails'].includes(key)) {
				acc[key] = parsed[key];
			}
			return acc;
		}, {} as any),
	};

	return strategy;
}

/**
 * Serialize structured form state back to JSON
 */
export function serializeStrategyJson(strategy: MasterStrategy): any {
	const json: any = {
		// Brand & Positioning
		brand_name: strategy.brand_name || strategy.brand?.brand_name || '',
		audience: strategy.audience || strategy.brand?.audience || '',
		value_props: strategy.value_props || strategy.brand?.value_props || '',
		brand_goals: strategy.brand_goals || strategy.brand?.brand_goals || '',
		offers: strategy.offers || strategy.brand?.offers || '',
		industry: strategy.industry || strategy.brand?.industry || '',
		positioning_statement: strategy.positioning_statement || strategy.brand?.positioning_statement || '',

		// Voice & Tone
		voice_rules: strategy.voice_rules || strategy.voice?.voice_rules || '',
		tone: strategy.tone || strategy.voice?.tone || '',
		personality: strategy.personality || strategy.voice?.personality || [],
		style_guidelines: strategy.style_guidelines || strategy.voice?.style_guidelines || '',

		// Content Pillars
		pillars: strategy.pillars || strategy.content_pillars || [],

		// Platform Cadence
		platform_cadence: strategy.platform_cadence || strategy.cadence || [],

		// Guardrails
		brand_keywords: Array.isArray(strategy.brand_keywords) 
			? strategy.brand_keywords 
			: (strategy.brand_keywords ? [strategy.brand_keywords] : []),
		exclude_keywords: Array.isArray(strategy.exclude_keywords) 
			? strategy.exclude_keywords 
			: (strategy.exclude_keywords ? [strategy.exclude_keywords] : []),
		content_rules: strategy.content_rules || strategy.guardrails?.content_rules || '',
		topics_to_avoid: strategy.topics_to_avoid || strategy.guardrails?.topics_to_avoid || [],
		risk_tolerance: strategy.risk_tolerance || strategy.guardrails?.risk_tolerance || '',
	};

	// Preserve any additional fields from original
	Object.keys(strategy).forEach((key) => {
		if (!['brand', 'voice', 'guardrails', 'brand_name', 'audience', 'value_props', 'brand_goals', 'offers', 'industry', 'positioning_statement', 'voice_rules', 'tone', 'personality', 'style_guidelines', 'pillars', 'content_pillars', 'platform_cadence', 'cadence', 'brand_keywords', 'exclude_keywords', 'content_rules', 'topics_to_avoid', 'risk_tolerance'].includes(key)) {
			json[key] = strategy[key];
		}
	});

	return json;
}