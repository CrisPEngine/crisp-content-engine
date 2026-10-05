/**
 * Report CrisP Digital native brand_destinations + resolution (no publish).
 */
import { createClient } from '@supabase/supabase-js';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { brandNameFromIdentity } from '@/lib/social/brandBrainName';
import { purposeForChannel } from '@/lib/social/channels';

const CRISP_BRAND = process.env.CRISP_BRAND_ID || '03bf17eb-7c11-4a20-b503-893493f4e908';

async function resolvePlatform(userId: string, airtableBrandId: string, platform: 'Facebook' | 'Instagram' | 'LinkedIn') {
	return resolvePublishDestination({ userId, airtableBrandId, platform });
}

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);

	const admin = createClient(url, key, { auth: { persistSession: false } });
	const { data: brand } = await admin
		.from('brand_brains')
		.select('id, user_id, airtable_brand_id, identity')
		.eq('id', CRISP_BRAND)
		.maybeSingle();
	if (!brand) {
		console.log(JSON.stringify({ ok: false, error: 'CrisP brand not found' }));
		process.exit(0);
	}

	const { data: links } = await admin
		.from('brand_destinations')
		.select('purpose, enabled, destination_id, social_destinations(display_name, handle, provider, destination_type)')
		.eq('brand_id', CRISP_BRAND);

	const facebook = await resolvePlatform(brand.user_id, brand.airtable_brand_id, 'Facebook');
	const instagram = await resolvePlatform(brand.user_id, brand.airtable_brand_id, 'Instagram');
	const linkedin = await resolvePlatform(brand.user_id, brand.airtable_brand_id, 'LinkedIn');

	console.log(
		JSON.stringify(
			{
				ok: Boolean(facebook && instagram && linkedin),
				brand: brandNameFromIdentity(brand.identity),
				brandDestinations: (links || []).map((l) => ({
					purpose: l.purpose,
					enabled: l.enabled,
					displayName: (l.social_destinations as { display_name?: string })?.display_name,
					handle: (l.social_destinations as { handle?: string })?.handle,
					provider: (l.social_destinations as { provider?: string })?.provider,
					type: (l.social_destinations as { destination_type?: string })?.destination_type,
				})),
				resolved: {
					facebook: facebook ? { displayName: facebook.displayName, handle: facebook.handle, source: facebook.source } : null,
					instagram: instagram ? { displayName: instagram.displayName, handle: instagram.handle, source: instagram.source } : null,
					linkedin: linkedin ? { displayName: linkedin.displayName, handle: linkedin.handle, source: linkedin.source } : null,
				},
				expectedPurposes: {
					facebook: purposeForChannel('facebook'),
					instagram: purposeForChannel('instagram'),
					linkedin: purposeForChannel('linkedin'),
				},
			},
			null,
			2
		)
	);
}

main();
