/**
 * CLI diagnostic for Threads reply permissions and optional target URL resolution.
 *
 * Usage:
 *   FOLIAN_BRAND_ID=<uuid> npx tsx scripts/diagnose-threads-reply-access.ts [threadsPostUrl]
 */
import { createClient } from '@supabase/supabase-js';
import { diagnoseThreadsReplyAccess } from '@/lib/threads/diagnoseReplyAccess';

const FOLIAN_BRAIN = process.env.FOLIAN_BRAND_ID || '03cba45a-6faf-4b6c-a20b-2c2496318b58';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);

	const targetUrl = process.argv[2];
	const admin = createClient(url, key, { auth: { persistSession: false } });
	const { data: brand } = await admin
		.from('brand_brains')
		.select('user_id, airtable_brand_id, identity')
		.eq('id', FOLIAN_BRAIN)
		.maybeSingle();
	if (!brand) {
		console.log(JSON.stringify({ ok: false, error: 'Brand brain not found' }, null, 2));
		process.exit(0);
	}

	const result = await diagnoseThreadsReplyAccess({
		userId: brand.user_id,
		airtableBrandId: brand.airtable_brand_id,
		targetUrl,
	});

	console.log(JSON.stringify({ brand: (brand.identity as { name?: string })?.name, ...result }, null, 2));
}

main();
