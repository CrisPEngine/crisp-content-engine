import type { BrandBrain } from '@/lib/intelligence/types';

/** Brand id used in UI filters and APIs (CCE brain id, with legacy Airtable id as alias). */
export function effectiveBrandProfileId(brain: Pick<BrandBrain, 'id' | 'airtableBrandId'>): string {
	return brain.airtableBrandId?.trim() || brain.id;
}

export function brainMatchesBrandFilter(
	brain: Pick<BrandBrain, 'id' | 'airtableBrandId'>,
	brandProfileId: string | null | undefined,
): boolean {
	if (!brandProfileId || brandProfileId === 'all') return true;
	const trimmed = brandProfileId.trim();
	return brain.id === trimmed || brain.airtableBrandId === trimmed;
}
