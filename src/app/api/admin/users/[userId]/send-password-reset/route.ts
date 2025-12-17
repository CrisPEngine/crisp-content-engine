import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { AuthPasswordResetEmail } from '@/emails/auth/AuthPasswordResetEmail';

export const runtime = 'nodejs';

async function checkAdmin(userId: string) {
	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function POST(
	req: Request,
	{ params }: { params: Promise<{ userId: string }> }
) {
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
		const { userId } = await params;

		// Get auth user info
		let authUser: any = null;
		try {
			const authResult = await admin.auth.admin.getUserById(userId);
			authUser = authResult.data;
		} catch (error) {
			return NextResponse.json({ 
				error: 'User not found in auth system' 
			}, { status: 404 });
		}

		if (!authUser?.user) {
			return NextResponse.json({ 
				error: 'User not found in auth system' 
			}, { status: 404 });
		}

		const userEmail = authUser.user.email || authUser.user.user_metadata?.email;
		if (!userEmail) {
			return NextResponse.json({ 
				error: 'User email not found' 
			}, { status: 400 });
		}

		// Generate password reset link using Supabase admin API
		const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/auth/callback`;
		const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
			type: 'recovery',
			email: userEmail,
			options: {
				redirectTo: redirectUrl,
			},
		});

		if (linkError || !linkData) {
			console.error('[Send Password Reset] Failed to generate reset link:', linkError);
			return NextResponse.json({ 
				error: linkError?.message || 'Failed to generate password reset link' 
			}, { status: 500 });
		}

		// Extract the reset URL
		const resetUrl = linkData.properties?.action_link || linkData.properties?.hashed_token 
			? `${redirectUrl}?token_hash=${linkData.properties.hashed_token}&type=recovery`
			: null;

		if (!resetUrl) {
			console.error('[Send Password Reset] No action link in generated reset link data:', linkData);
			return NextResponse.json({ 
				error: 'Failed to generate password reset URL' 
			}, { status: 500 });
		}

		// Send password reset email
		try {
			await sendEmail({
				to: userEmail,
				subject: 'Reset your CRISP Content Engine password',
				react: AuthPasswordResetEmail({ 
					resetUrl, 
					userEmail 
				}),
				category: 'auth',
			});

			console.log('[Send Password Reset] Password reset email sent successfully:', { email: userEmail, userId });

			return NextResponse.json({ 
				success: true,
				message: `Password reset email sent successfully to ${userEmail}`,
				email: userEmail,
			});
		} catch (emailError: any) {
			console.error('[Send Password Reset] Failed to send password reset email:', emailError);
			return NextResponse.json({ 
				error: 'Failed to send password reset email',
				details: emailError.message 
			}, { status: 500 });
		}
	} catch (e: any) {
		console.error('[Send Password Reset] Error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
