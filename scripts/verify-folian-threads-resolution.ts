/**
 * Verify Folian Threads destination resolution (no publish).
 */
import { createClient } from '@supabase/supabase-js';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';

const FOLIAN_BRAIN = process.env.FOLIAN_BRAND_ID || '03cba45a-6faf-4b6c-a20b-2c2496318b58';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);

	const admin = createClient(url, key, { auth: { persistSession: false } });
	const { data: brand } = await admin.from('brand_brains').select('user_id, airtable_brand_id, identity').eq('id', FOLIAN_BRAIN).maybeSingle();
	if (!brand) {
		console.log(JSON.stringify({ ok: false, error: 'Folian brand brain not found' }));
		process.exit(0);
	}

	const resolved = await resolvePublishDestination({
		userId: brand.user_id,
		airtableBrandId: brand.airtable_brand_id,
		platform: 'Threads',
	});

	console.log(
		JSON.stringify(
			{
				ok: Boolean(resolved),
				brand: (brand.identity as { name?: string })?.name,
				resolved: resolved
					? {
							source: resolved.source,
							displayName: resolved.displayName,
							handle: resolved.handle,
							provider: resolved.provider,
						}
					: null,
			},
			null,
			2
		)
	);
}

main();
