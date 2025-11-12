import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function POST() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const admin = getSupabaseService();
	await admin
		.from('social_connections')
		.delete()
		.eq('user_id', user.id)
		.eq('provider', 'linkedin');

	return NextResponse.json({ ok: true });
}
