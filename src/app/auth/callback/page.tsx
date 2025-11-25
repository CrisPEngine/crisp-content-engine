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

		// Handle password reset flow - redirect to login with token
		// This works for both existing users (forgot password) and new users (set initial password)
		// IMPORTANT: Keep token_hash in URL so Auth UI component can read it
		if (type === 'recovery' && (token || tokenHash)) {
			console.log('Redirecting to login with recovery token:', { type, hasToken: !!token, hasTokenHash: !!tokenHash });
			const params = new URLSearchParams();
			params.set('type', 'recovery');
			if (token) params.set('token', token);
			if (tokenHash) params.set('token_hash', tokenHash);
			// Use replace instead of push to avoid adding to history
			router.replace(`/login?${params.toString()}`);
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

