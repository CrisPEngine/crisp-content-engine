'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

function CallbackHandler() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = supabaseBrowser();

	useEffect(() => {
		// Wait for searchParams to be available
		if (!searchParams) {
			console.log('Waiting for searchParams...');
			return;
		}

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
		const type = searchParams.get('type');
		const token = searchParams.get('token');
		const tokenHash = searchParams.get('token_hash');
		const code = searchParams.get('code');
		const error = searchParams.get('error');
		const errorDescription = searchParams.get('error_description');

		// Handle errors from query params
		if (error) {
			console.error('Auth callback query error:', { error, errorDescription });
			router.push(`/login?error=${encodeURIComponent(error)}${errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : ''}`);
			return;
		}

		// Handle password reset flow - redirect to login with token_hash
		// Don't verify here - let the login page handle verification
		// This ensures token_hash is preserved in the URL
		if (type === 'recovery' && (token || tokenHash)) {
			console.log('Password reset flow detected, redirecting to login:', { 
				type, 
				hasToken: !!token, 
				hasTokenHash: !!tokenHash,
				fullUrl: typeof window !== 'undefined' ? window.location.href : 'N/A'
			});
			const params = new URLSearchParams();
			params.set('type', 'recovery');
			if (token) params.set('token', token);
			if (tokenHash) {
				params.set('token_hash', tokenHash);
			}
			const loginUrl = `/login?${params.toString()}`;
			console.log('Redirecting to:', loginUrl);
			// Use replace to avoid adding to history
			router.replace(loginUrl);
			return;
		}

		// Handle OAuth code exchange
		if (code && supabase) {
			console.log('Exchanging OAuth code for session');
			// Redirect immediately to dashboard with loading state
			// The dashboard will show skeleton while session is being established
			router.replace('/dashboard?auth=loading');
			
			// Exchange code in background
			supabase.auth.exchangeCodeForSession(code)
				.then((response: { data: any; error: any }) => {
					if (response.error) {
						console.error('Error exchanging code:', response.error);
						router.replace('/login?error=oauth_error');
						return;
					}
					// Session established - refresh dashboard to show content
					router.refresh();
				})
				.catch((err: unknown) => {
					console.error('Exception exchanging code:', err);
					router.replace('/login?error=oauth_error');
				});
			return;
		}

		// If no recognized parameters, check URL directly as fallback
		const currentUrl = new URL(window.location.href);
		const urlType = currentUrl.searchParams.get('type');
		const urlTokenHash = currentUrl.searchParams.get('token_hash');
		const urlToken = currentUrl.searchParams.get('token');
		
		// Fallback: check URL directly if searchParams didn't catch it
		if (urlType === 'recovery' && (urlToken || urlTokenHash)) {
			console.log('Fallback: Found recovery params in URL directly:', { urlType, hasToken: !!urlToken, hasTokenHash: !!urlTokenHash });
			const params = new URLSearchParams();
			params.set('type', 'recovery');
			if (urlToken) params.set('token', urlToken);
			if (urlTokenHash) params.set('token_hash', urlTokenHash);
			router.replace(`/login?${params.toString()}`);
			return;
		}

		// If still no recognized parameters, redirect to login
		console.warn('Callback page loaded with no recognized parameters, redirecting to login');
		if (typeof window !== 'undefined') {
			console.log('Current URL:', window.location.href);
			console.log('Search params:', Object.fromEntries(currentUrl.searchParams));
		}
		router.replace('/login');
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

