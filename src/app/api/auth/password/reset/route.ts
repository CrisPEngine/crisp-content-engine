import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { AuthPasswordResetEmail } from '@/emails/auth/AuthPasswordResetEmail';
import { z } from 'zod';

export const runtime = 'nodejs';

const resetPasswordSchema = z.object({
	email: z.string().email('Invalid email address'),
});

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { email } = resetPasswordSchema.parse(body);

		const admin = getSupabaseService();
		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
		const redirectTo = `${appUrl}/auth/callback`;

		// Generate password recovery link using Supabase admin API
		const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
			type: 'recovery',
			email,
			options: {
				redirectTo,
			},
		});

		if (linkError || !linkData) {
			console.error('Failed to generate password reset link:', linkError);
			return NextResponse.json(
				{ error: linkError?.message || 'Failed to generate password reset link' },
				{ status: 500 }
			);
		}

		// Extract the action link from the generated link
		// The generateLink returns properties that include the action_link
		const resetUrl = linkData.properties?.action_link || linkData.properties?.hashed_token 
			? `${redirectTo}?token_hash=${linkData.properties.hashed_token}&type=recovery`
			: null;

		if (!resetUrl) {
			console.error('No action link in generated link data:', linkData);
			return NextResponse.json(
				{ error: 'Failed to extract reset URL from generated link' },
				{ status: 500 }
			);
		}

		// Send email via Resend
		try {
			await sendEmail({
				to: email,
				subject: 'Reset your password',
				react: AuthPasswordResetEmail({ resetUrl, userEmail: email }),
				category: 'auth',
			});

			console.log('Password reset email sent successfully:', { email });
		} catch (emailError: any) {
			console.error('Failed to send password reset email:', emailError);
			return NextResponse.json(
				{ error: 'Failed to send password reset email', details: emailError.message },
				{ status: 500 }
			);
		}

		// Return success (don't expose the reset URL)
		return NextResponse.json({
			success: true,
			message: 'Password reset email sent successfully',
		});
	} catch (error: any) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation error', details: error.issues },
				{ status: 400 }
			);
		}

		console.error('Password reset error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}


