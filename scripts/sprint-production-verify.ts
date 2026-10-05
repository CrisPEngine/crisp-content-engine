/**
 * Read-only production verification (no secrets in output).
 * Usage: npx tsx scripts/sprint-production-verify.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER = process.env.VERIFY_USER_ID || 'f0c7cb60-8b0a-4c0a-9f0a-8e8b8e8b8e8b';

async function main() {
	if (!url || !key) {
		console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
		process.exit(1);
	}
	const admin = createClient(url, key, { auth: { persistSession: false } });

	const checks: Record<string, unknown> = {};

	const { data: deployHint } = await admin.from('brand_brains').select('id').limit(1);
	checks.supabaseReachable = Boolean(deployHint);

	const { count: authRows } = await admin
		.from('social_authorizations')
		.select('id', { count: 'exact', head: true });
	const { count: destRows } = await admin
		.from('social_destinations')
		.select('id', { count: 'exact', head: true });
	const { count: brandDestRows } = await admin
		.from('brand_destinations')
		.select('brand_id', { count: 'exact', head: true });

	checks.migration029 = {
		social_authorizations: authRows ?? 0,
		social_destinations: destRows ?? 0,
		brand_destinations: brandDestRows ?? 0,
	};

	const { data: brands } = await admin
		.from('brand_brains')
		.select('id, airtable_brand_id, identity')
		.in('id', ['03bf17eb-7c11-4a20-b503-893493f4e908', '03cba45a-6faf-4b6c-a20b-2c2496318b58'])
		.limit(5);

	checks.nativeBrandsSample = (brands || []).map((b) => ({
		id: b.id,
		airtable: b.airtable_brand_id,
		name: (b.identity as { name?: string })?.name,
	}));

	const { data: li } = await admin
		.from('social_connections')
		.select(
			'id, connection_type, organization_urn, brand_profile_id, expires_at, needs_reauth, account_name'
		)
		.eq('provider', 'linkedin')
		.not('organization_urn', 'is', null)
		.limit(5);

	checks.linkedInOrgConnections = (li || []).map((c) => ({
		id: c.id,
		type: c.connection_type,
		org: c.organization_urn,
		brand: c.brand_profile_id,
		expires: c.expires_at,
		needsReauth: c.needs_reauth,
		name: c.account_name,
	}));

	const { data: meta } = await admin
		.from('meta_connections')
		.select('id, facebook_user_id, token_expires_at')
		.limit(5);
	checks.metaConnections = (meta || []).map((m) => ({
		id: m.id,
		facebookUserId: m.facebook_user_id,
		expires: m.token_expires_at,
	}));

	const { data: pages, error: pagesErr } = await admin
		.from('meta_pages')
		.select('page_name, is_selected, page_id')
		.limit(20);
	const { data: ig, error: igErr } = await admin
		.from('meta_instagram_accounts')
		.select('ig_username, is_selected, ig_user_id')
		.limit(20);

	checks.metaSelected = {
		pagesErr: pagesErr?.message,
		instagramErr: igErr?.message,
		pages,
		instagram: ig,
	};

	console.log(JSON.stringify(checks, null, 2));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
