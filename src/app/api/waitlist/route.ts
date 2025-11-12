import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const plan = typeof body.plan === 'string' ? body.plan.trim() : '';

		if (!email || !emailRegex.test(email)) {
			return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
		}

		if (!plan) {
			return NextResponse.json({ error: 'Missing plan name.' }, { status: 400 });
		}

		const supabase = await createClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();

		const admin = getSupabaseService();
		await admin.from('plan_waitlist').insert({
			email,
			plan,
			user_id: user?.id ?? null,
			requested_at: new Date().toISOString(),
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('Waitlist API error:', error);
		return NextResponse.json({ error: 'Failed to join waitlist.' }, { status: 500 });
	}
}
