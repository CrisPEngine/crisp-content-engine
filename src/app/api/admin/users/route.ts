import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

async function checkAdmin(userId: string) {
	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('user_id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function GET(req: Request) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const admin = getSupabaseService();
		const { searchParams } = new URL(req.url);
		const query = searchParams.get('q') || '';
		const limit = parseInt(searchParams.get('limit') || '50', 10);

		let queryBuilder = admin.from('profiles').select('user_id, email, full_name, is_admin, created_at');

		if (query) {
			queryBuilder = queryBuilder.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
		}

		const { data: users, error } = await queryBuilder.limit(limit);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ users: users || [] });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

