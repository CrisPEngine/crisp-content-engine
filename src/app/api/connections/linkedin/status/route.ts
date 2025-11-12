import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const admin = getSupabaseService();
	const { data } = await admin
		.from('social_connections')
		.select('account_name, account_avatar, expires_at, person_urn, metadata')
		.eq('user_id', user.id)
		.eq('provider', 'linkedin')
		.maybeSingle();

	if (!data) {
		return NextResponse.json({ connected: false });
	}

	return NextResponse.json({
		connected: true,
		accountName: data.account_name,
		accountAvatar: data.account_avatar,
		expiresAt: data.expires_at,
		personUrn: data.person_urn,
		metadata: data.metadata,
	});
}
