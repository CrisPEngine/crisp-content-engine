'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';

function CallbackHandler() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useSupabase();

	useEffect(() => {
		// Handle hash fragments (Supabase sometimes uses these for errors)
		// Hash fragments are only available client-side
		const hash = window.location.hash;
		if (hash) {
			const hashParams = new URLSearchParams(hash.substring(1));
			const error = hashParams.get('error');
			const errorDescription = hashParams.get('error_description');
			
			if (error) {
				console.error('Auth callback hash error:', { error, errorDescription });
				router.push(`/login?error=${encodeURIComponent(error)}${errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : ''}`);
				return;
			}
		}

		// Handle query parameters
		const type = searchParams?.get('type');
		const token = searchParams?.get('token');
		const tokenHash = searchParams?.get('token_hash');
		const code = searchParams?.get('code');
		const error = searchParams?.get('error');
		const errorDescription = searchParams?.get('error_description');

		// Handle errors from query params
		if (error) {
			console.error('Auth callback query error:', { error, errorDescription });
			router.push(`/login?error=${encodeURIComponent(error)}${errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : ''}`);
			return;
		}

		// Handle password reset flow
		// For token_hash, we need to verify it client-side to establish a session
		// Then redirect to login with the password update form
		if (type === 'recovery' && tokenHash && supabase) {
			console.log('Password reset flow detected, verifying token_hash:', { type, hasTokenHash: !!tokenHash });
			
			// Verify the token_hash using verifyOtp to establish a session
			// This is required before the user can update their password
			supabase.auth.verifyOtp({
				token_hash: tokenHash,
				type: 'recovery',
			})
				.then((response: { data: any; error: any }) => {
					if (response.error) {
						console.error('Error verifying recovery token:', response.error);
						// Redirect to login with error
						router.push(`/login?error=token_verification_failed&error_description=${encodeURIComponent(response.error.message)}`);
					} else if (response.data?.session) {
						console.log('Recovery token verified, session established');
						// Session is now established, redirect to login with update_password view
						// The Auth UI will detect the session and allow password update
						router.push('/login?type=recovery&session=established');
					} else {
						console.warn('Token verified but no session created');
						// Still redirect to login - Auth UI might handle it
						router.push('/login?type=recovery');
					}
				})
				.catch((err: unknown) => {
					console.error('Exception verifying recovery token:', err);
					router.push('/login?error=token_verification_error');
				});
			return;
		}
		
		// Handle old token format or fallback
		if (type === 'recovery' && token) {
			console.log('Password reset flow with token (old format):', { type, hasToken: !!token });
			const params = new URLSearchParams();
			params.set('type', 'recovery');
			params.set('token', token);
			router.push(`/login?${params.toString()}`);
			return;
		}

		// Handle OAuth code exchange
		if (code && supabase) {
			console.log('Exchanging OAuth code for session');
			supabase.auth.exchangeCodeForSession(code)
				.then((response: { data: any; error: any }) => {
					if (response.error) {
						console.error('Error exchanging code:', response.error);
						router.push('/login?error=oauth_error');
						return;
					}
					// Success - redirect to dashboard (profile creation happens on dashboard load)
					router.push('/dashboard');
				})
				.catch((err: unknown) => {
					console.error('Exception exchanging code:', err);
					router.push('/login?error=oauth_error');
				});
			return;
		}

		// If no recognized parameters, redirect to login
		console.warn('Callback page loaded with no recognized parameters');
		router.push('/login');
	}, [router, searchParams, supabase]);

	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<div className="text-text-soft">Processing authentication...</div>
			</div>
		</div>
	);
}

export default function CallbackPage() {
	return (
		<Suspense fallback={
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-text-soft">Loading...</div>
				</div>
			</div>
		}>
			<CallbackHandler />
		</Suspense>
	);
}

