import { createClient } from '@supabase/supabase-js';
import { syncNativeSocialForUser } from '@/lib/social/nativeSync';

async function main() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) process.exit(1);
	const admin = createClient(url, key, { auth: { persistSession: false } });
	const userId = process.env.CCE_OWNER_USER_ID || '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';
	const sync = await syncNativeSocialForUser(userId);
	const { data: links } = await admin
		.from('brand_destinations')
		.select('brand_id, purpose, social_destinations(display_name, handle, provider, destination_type)')
		.in('brand_id', ['03bf17eb-7c11-4a20-b503-893493f4e908', '03cba45a-6faf-4b6c-a20b-2c2496318b58']);
	const { data: li } = await admin
		.from('social_connections')
		.select('id, connection_type, brand_profile_id, account_name, organization_name, organization_urn, person_urn')
		.eq('user_id', userId)
		.eq('provider', 'linkedin');
	console.log(JSON.stringify({ sync, brandDestinations: links, linkedInConnections: li }, null, 2));
}

main();
