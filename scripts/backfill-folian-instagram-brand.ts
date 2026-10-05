/**
 * One-time: link Folian brand to the Instagram Login destination @folian.app (production OAuth).
 * Safe: only assigns if destination matches folian handle and brand is Folian id.
 */
import { createClient } from '@supabase/supabase-js';
import { purposeForChannel } from '@/lib/social/channels';

const FOLIAN_BRAND = '03cba45a-6faf-4b6c-a20b-2c2496318b58';
const FOLIAN_DESTINATION = '4dd631ef-16d0-4479-90ea-7a48909c70b2';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('Missing Supabase env');
		process.exit(1);
	}
	const admin = createClient(url, key, { auth: { persistSession: false } });

	const { data: dest } = await admin
		.from('social_destinations')
		.select('id, handle, display_name, provider, destination_type')
		.eq('id', FOLIAN_DESTINATION)
		.maybeSingle();
	if (!dest) {
		console.log(JSON.stringify({ ok: false, error: 'destination not found' }));
		process.exit(1);
	}
	const handle = (dest.handle || dest.display_name || '').replace(/^@/, '').toLowerCase();
	if (handle !== 'folian.app') {
		console.log(JSON.stringify({ ok: false, error: 'destination is not @folian.app', handle }));
		process.exit(1);
	}

	const purpose = purposeForChannel('instagram');
	const { error } = await admin.from('brand_destinations').upsert(
		{
			brand_id: FOLIAN_BRAND,
			destination_id: FOLIAN_DESTINATION,
			purpose,
			enabled: true,
		},
		{ onConflict: 'brand_id,destination_id,purpose' }
	);
	if (error) {
		console.log(JSON.stringify({ ok: false, error: error.message }));
		process.exit(1);
	}
	console.log(JSON.stringify({ ok: true, brandId: FOLIAN_BRAND, destinationId: FOLIAN_DESTINATION, purpose }));
}

main();
