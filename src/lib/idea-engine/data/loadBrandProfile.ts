import 'server-only';

import { getRecord } from '@/lib/airtable/client';
import type { BrandContext } from '../types';
import { IdeaEngineError } from '../errors';

export async function loadBrandProfile(brandProfileId: string): Promise<BrandContext> {
	const table = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	const pat = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;

	if (!table || !pat || !baseId) {
		throw new IdeaEngineError('Airtable is not configured for Idea Engine', {
			status: 500,
			code: 'idea_engine_missing_airtable',
		});
	}

	try {
		const record = await getRecord({ table, recordId: brandProfileId });
		return (record.fields || {}) as BrandContext;
	} catch (error) {
		console.warn('[IdeaEngine] Brand profile fetch failed:', error);
		return {};
	}
}

export function extractTimezoneAndWindows(brandContext: BrandContext): {
	timezone: string;
	postingWindows: unknown;
} {
	const tz = brandContext.timezone;
	const timezone =
		typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC';
	return {
		timezone,
		postingWindows: brandContext.posting_windows ?? null,
	};
}
