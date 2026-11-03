import { folianTaxonomyFallback } from './folian/taxonomyFallback';
import { fetchFolianTaxonomy } from './folianClient';
import type { DestinationTaxonomy } from './destinationTaxonomy';

export function editorialDestinationForBrand(brandId: string): string | null {
	const folianBrand = (process.env.FOLIAN_BRAND_ID ?? '03cba45a-6faf-4b6c-a20b-2c2496318b58').trim();
	if (brandId === folianBrand) return 'folian';
	return null;
}

export async function loadDestinationTaxonomy(destinationId: string): Promise<DestinationTaxonomy | null> {
	if (destinationId === 'folian') {
		const remote = await fetchFolianTaxonomy();
		return remote ?? folianTaxonomyFallback;
	}
	return null;
}
