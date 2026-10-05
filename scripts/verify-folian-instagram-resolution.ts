/**
 * Verify Folian Instagram destination resolution (no publish).
 * Requires SUPABASE_SERVICE_ROLE_KEY and Folian brand + assignment after OAuth.
 */
import { createClient } from '@supabase/supabase-js';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';

const FOLIAN_BRAIN = process.env.FOLIAN_BRAND_ID || '03cba45a-0000-0000-0000-000000000001';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);

	const admin = createClient(url, key, { auth: { persistSession: false } });
	const { data: brand } = await admin.from('brand_brains').select('user_id, airtable_brand_id, identity_json').eq('id', FOLIAN_BRAIN).maybeSingle();
	if (!brand) {
		console.log(JSON.stringify({ ok: false, error: 'Folian brand brain not found', brandId: FOLIAN_BRAIN }));
		process.exit(0);
	}

	const resolved = await resolvePublishDestination({
		userId: brand.user_id,
		airtableBrandId: brand.airtable_brand_id,
		platform: 'Instagram',
	});

	console.log(
		JSON.stringify(
			{
				ok: Boolean(resolved),
				brand: (brand.identity_json as { name?: string })?.name,
				resolved: resolved
					? {
							source: resolved.source,
							displayName: resolved.displayName,
							handle: resolved.handle,
							provider: resolved.provider,
							destinationType: 'native',
						}
					: null,
			},
			null,
			2
		)
	);
}

main();
