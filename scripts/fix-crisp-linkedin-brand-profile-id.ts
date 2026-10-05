/**
 * Align LinkedIn organization connection brand_profile_id with CrisP Digital brand brain (Airtable id).
 * Only updates when organization name matches and current id does not resolve to a brand_brains row.
 */
import { createClient } from '@supabase/supabase-js';

const CRISP_AIRTABLE = 'recQY6or1JBIeKFzR';
const ORG_CONNECTION = 'cf3eaf86-8e25-4599-82b5-2bfe0900983e';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);
	const admin = createClient(url, key, { auth: { persistSession: false } });

	const { data: conn } = await admin
		.from('social_connections')
		.select('id, brand_profile_id, organization_name, user_id')
		.eq('id', ORG_CONNECTION)
		.maybeSingle();
	if (!conn || conn.organization_name !== 'CrisP Digital') {
		console.log(JSON.stringify({ ok: false, error: 'unexpected org connection' }));
		process.exit(1);
	}

	if (conn.brand_profile_id === CRISP_AIRTABLE) {
		console.log(JSON.stringify({ ok: true, skipped: true, reason: 'already aligned' }));
		return;
	}

	const { data: resolves } = await admin
		.from('brand_brains')
		.select('id')
		.eq('airtable_brand_id', conn.brand_profile_id || '')
		.maybeSingle();
	if (resolves?.id) {
		console.log(JSON.stringify({ ok: false, error: 'current brand_profile_id still resolves; not updating' }));
		process.exit(1);
	}

	const { error } = await admin
		.from('social_connections')
		.update({ brand_profile_id: CRISP_AIRTABLE })
		.eq('id', ORG_CONNECTION);
	if (error) {
		console.log(JSON.stringify({ ok: false, error: error.message }));
		process.exit(1);
	}
	console.log(JSON.stringify({ ok: true, updated: ORG_CONNECTION, brand_profile_id: CRISP_AIRTABLE }));
}

main();
