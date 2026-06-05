import 'server-only';

import { getBrandProfileField } from '@/lib/airtable/readBrandProfileRecord';
import type { BrandContext } from '../types';

const COMPANY_FIELDS: Array<[string, string]> = [
	['client_name', 'Brand name'],
	['brand_type', 'Brand type'],
	['audience', 'Audience'],
	['value_props', 'Value propositions'],
	['offers', 'Offers'],
	['brand_goals', 'Brand goals'],
	['voice_rules', 'Voice rules'],
	['content_rules', 'Content rules'],
	['brand_keywords', 'Keywords'],
	['exclude_keywords', 'Exclude keywords'],
	['timezone', 'Timezone'],
	['language_region', 'Language region'],
	['posting_windows', 'Posting windows'],
	['preferred_image_source', 'Preferred image source'],
	['additional_info', 'Additional context'],
];

const PERSONAL_FIELDS: Array<[string, string]> = [
	['personal_full_name', 'Name'],
	['personal_headline', 'Headline'],
	['personal_audience', 'Audience'],
	['personal_expertise', 'Expertise'],
	['personal_goals', 'Goals'],
	['personal_voice_traits', 'Voice traits'],
	['personal_tone_avoid', 'Tone to avoid'],
	['personal_content_style', 'Content style'],
	['personal_exclude_keywords', 'Exclude keywords'],
	['personal_story', 'Story'],
];

function fieldString(fields: BrandContext, key: string): string {
	const value = getBrandProfileField(fields, key);
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(String).join(', ');
	return String(value);
}

export function formatBrandContextForPrompt(brandContext: BrandContext): string {
	const brandType = fieldString(brandContext, 'brand_type');
	const isPersonal = brandType === 'personal';
	const fieldList = isPersonal ? PERSONAL_FIELDS : COMPANY_FIELDS;
	const sections: string[] = [];

	for (const [key, label] of fieldList) {
		const value = fieldString(brandContext, key);
		if (value) sections.push(`${label}: ${value}`);
	}

	const strategyJson = fieldString(brandContext, 'strategy_json');
	if (strategyJson) {
		sections.push('Strategy JSON:');
		sections.push(strategyJson);
	}

	return sections.join('\n');
}
