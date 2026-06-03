import { OperatorActionError } from '../actions/errors';
import type {
	AdapterResult,
	BrandRecord,
	ContentRecord,
	MakeAdapter,
} from './types';
import type {
	GenerateContentBatchInput,
	GenerateOrRefreshBrandStrategyInput,
	RegenerateIndividualPostInput,
} from '../actions/schemas';

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new OperatorActionError(`${name} is not configured`, {
			status: 500,
			code: 'operator_missing_env',
			details: { env: name },
		});
	}
	return value;
}

function optionalArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter(Boolean);
	if (typeof value === 'string' && value.trim()) {
		return value.split(',').map((item) => item.trim()).filter(Boolean);
	}
	return [];
}

function firstLinkedRecord(value: unknown): string | null {
	if (!value) return null;
	if (Array.isArray(value)) {
		const first = value[0];
		if (!first) return null;
		if (typeof first === 'string') return first;
		const linked = first as { id?: unknown };
		return linked.id ? String(linked.id) : String(first);
	}
	if (typeof value === 'string') return value;
	if (typeof value === 'object') {
		const linked = value as { id?: unknown };
		if (linked.id) return String(linked.id);
	}
	return null;
}

function parseStrategy(value: unknown) {
	if (!value || typeof value !== 'string') return value ?? null;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function makeHeaders() {
	const sharedSecret = process.env.MAKE_SHARED_SECRET;
	return {
		'Content-Type': 'application/json',
		...(process.env.MAKE_API_KEY ? { 'x-api-key': process.env.MAKE_API_KEY } : {}),
		...(sharedSecret ? { 'x-make-secret': sharedSecret } : {}),
	};
}

async function postWebhook(url: string, payload: unknown, headers = makeHeaders()) {
	const response = await fetch(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(payload),
	});
	const responseText = await response.text().catch(() => '');

	if (!response.ok) {
		throw new OperatorActionError('Make webhook failed', {
			status: 502,
			code: 'operator_make_webhook_failed',
			details: {
				status: response.status,
				statusText: response.statusText,
				body: responseText.slice(0, 1000),
			},
		});
	}

	return {
		status: response.status,
		body: responseText,
	};
}

function buildBrandStrategyPayload(input: GenerateOrRefreshBrandStrategyInput, brand: BrandRecord) {
	const fields = brand.fields || {};
	const brandType = fields.brand_type || 'company';

	return {
		mode: input.mode,
		strategy_update_id: input.strategyUpdateId ?? null,
		brand_profile_id: input.brandProfileId,
		airtable_table: 'BrandProfiles',
		user_id: fields.user_id || null,
		brand_type: brandType,
		brand: {
			name: fields.client_name || '',
			website: fields.website || '',
			timezone: fields.timezone || '',
			language_region: fields.language_region || '',
			voice_rules: fields.voice_rules || '',
			brand_keywords: optionalArray(fields.brand_keywords),
			exclude_keywords: optionalArray(fields.exclude_keywords),
			content_rules: fields.content_rules || '',
			brand_palette: fields.brand_palette || '',
			preferred_image_source: fields.preferred_image_source || '',
			approval_contact_email: fields.approval_contact_email || '',
		},
		audience: fields.audience || '',
		value_props: fields.value_props || '',
		offers: fields.offers || '',
		brand_goals: fields.brand_goals || '',
		platforms_requested: optionalArray(fields.platforms_requested),
		urls_to_scrape: optionalArray(fields.website),
		assets: optionalArray(fields.brand_assets).map((url) => ({ url })),
		personal: brandType === 'personal'
			? {
				personal_full_name: fields.personal_full_name || '',
				personal_job_title: fields.personal_job_title || '',
				personal_industry: fields.personal_industry || '',
				personal_links: fields.personal_links || '',
				personal_headline: fields.personal_headline || '',
				personal_audience: fields.personal_audience || '',
				personal_expertise: fields.personal_expertise || '',
				personal_goals: fields.personal_goals || '',
				personal_voice_traits: optionalArray(fields.personal_voice_traits),
				personal_tone_avoid: optionalArray(fields.personal_tone_avoid),
				personal_risk_tolerance: fields.personal_risk_tolerance || '',
				personal_content_style: optionalArray(fields.personal_content_style),
				personal_exclude_keywords: fields.personal_exclude_keywords || '',
				personal_story: fields.personal_story || '',
				personal_assets_urls: optionalArray(fields.personal_assets),
			}
			: null,
		strategy_context: {
			submitted_at: new Date().toISOString(),
			extra_instructions: input.extraInstructions || '',
		},
		monthly: null,
	};
}

function buildContentBatchPayload(input: GenerateContentBatchInput, brand: BrandRecord) {
	const fields = brand.fields || {};
	const strategyJson = parseStrategy(fields.strategy_json || fields.strategy_payload);

	return {
		trigger_type: input.triggerType,
		brand_profile_id: input.brandProfileId,
		user_id: input.userId || fields.user_id || null,
		person_urn: null,
		organization_urn: null,
		brand_type: fields.brand_type || 'company',
		platform: input.platform,
		strategy_id: input.strategyId || null,
		strategy_json: strategyJson,
		strategy_summary: fields.strategy_summary || '',
		platforms_requested: optionalArray(fields.platforms_requested),
		triggered_at: new Date().toISOString(),
		requested_by: 'operator_action',
	};
}

function buildRegeneratePayload(input: RegenerateIndividualPostInput, content: ContentRecord) {
	const fields = content.fields || {};
	return {
		content_id: input.contentId,
		brand_profile_id: firstLinkedRecord(fields.brand_profile_id),
		user_id: fields.user_id || null,
		rejection_feedback: input.feedback || '',
		rejected_at: new Date().toISOString(),
		requested_by: 'operator_action',
		current_content: {
			platform: fields.platform || '',
			hook: fields.hook || '',
			post_content: fields.post_content || '',
			hashtags: fields.hashtags || '',
			status: fields.status || '',
		},
	};
}

export class MakeOperatorAdapter implements MakeAdapter {
	async generateOrRefreshBrandStrategy(input: GenerateOrRefreshBrandStrategyInput, brand: BrandRecord, dryRun: boolean): Promise<AdapterResult> {
		const payload = buildBrandStrategyPayload(input, brand);
		const url = requireEnv('MAKE_STRATEGY_WEBHOOK_URL');
		const headers = {
			...makeHeaders(),
			...(process.env.MAKE_STRATEGY_WEBHOOK_SECRET ? { 'x-make-secret': process.env.MAKE_STRATEGY_WEBHOOK_SECRET } : {}),
		};

		if (dryRun) {
			return {
				provider: 'make',
				payload: { urlConfigured: Boolean(url), headers: Object.keys(headers), body: payload },
				message: 'Dry run: would trigger strategy webhook',
			};
		}

		const response = await postWebhook(url, payload, headers);
		return {
			provider: 'make',
			payload,
			response,
			message: 'Strategy generation webhook triggered',
		};
	}

	async generateContentBatch(input: GenerateContentBatchInput, brand: BrandRecord, dryRun: boolean): Promise<AdapterResult> {
		const payload = buildContentBatchPayload(input, brand);
		const url = requireEnv('MAKE_CONTENT_GENERATION_WEBHOOK_URL');
		const headers = {
			...makeHeaders(),
			...(process.env.MAKE_CONTENT_WEBHOOK_SECRET ? { 'x-make-secret': process.env.MAKE_CONTENT_WEBHOOK_SECRET } : {}),
		};

		if (dryRun) {
			return {
				provider: 'make',
				payload: { urlConfigured: Boolean(url), headers: Object.keys(headers), body: payload },
				message: 'Dry run: would trigger content generation webhook',
			};
		}

		const response = await postWebhook(url, payload, headers);
		return {
			provider: 'make',
			payload,
			response,
			message: 'Content generation webhook triggered',
		};
	}

	async regenerateIndividualPost(input: RegenerateIndividualPostInput, content: ContentRecord, dryRun: boolean): Promise<AdapterResult> {
		const payload = buildRegeneratePayload(input, content);
		const url = requireEnv('MAKE_CONTENT_REGENERATE_WEBHOOK_URL');

		if (dryRun) {
			return {
				provider: 'make',
				payload: { urlConfigured: Boolean(url), body: payload },
				message: 'Dry run: would trigger content regeneration webhook',
			};
		}

		const response = await postWebhook(url, payload);
		return {
			provider: 'make',
			payload,
			response,
			message: 'Content regeneration webhook triggered',
		};
	}
}
