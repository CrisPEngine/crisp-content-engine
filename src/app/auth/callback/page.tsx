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

		// Handle query parameters first to get redirectTo
		const type = searchParams.get('type');
		const token = searchParams.get('token');
		const tokenHash = searchParams.get('token_hash');
		const code = searchParams.get('code');
		const error = searchParams.get('error');
		const errorDescription = searchParams.get('error_description');
		const redirectTo = searchParams.get('redirect_to');
		const safeRedirectTo = redirectTo && redirectTo.startsWith('/') ? redirectTo : null;

		// Handle hash fragments (Supabase sometimes uses these for errors)
		// Hash fragments are only available client-side
		const hash = window.location.hash;
		if (hash) {
			const hashParams = new URLSearchParams(hash.substring(1));
			const hashError = hashParams.get('error');
			const hashErrorDescription = hashParams.get('error_description');
			
			if (hashError) {
				console.error('Auth callback hash error:', { error: hashError, errorDescription: hashErrorDescription });
				const redirectParam = safeRedirectTo ? `&redirect_to=${encodeURIComponent(safeRedirectTo)}` : '';
				router.push(`/sign-in?error=${encodeURIComponent(hashError)}${hashErrorDescription ? `&error_description=${encodeURIComponent(hashErrorDescription)}` : ''}${redirectParam}`);
				return;
			}
		}

		// Handle errors from query params
		if (error) {
			console.error('Auth callback query error:', { error, errorDescription });
			const redirectParam = safeRedirectTo ? `&redirect_to=${encodeURIComponent(safeRedirectTo)}` : '';
			router.push(`/sign-in?error=${encodeURIComponent(error)}${errorDescription ? `&error_description=${encodeURIComponent(errorDescription)}` : ''}${redirectParam}`);
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
			const loginUrl = `/sign-in?${params.toString()}`;
			console.log('Redirecting to:', loginUrl);
			// Use replace to avoid adding to history
			router.replace(loginUrl);
			return;
		}

		// Handle OAuth code exchange
		if (code && supabase) {
			console.log('Exchanging OAuth code for session');
			
			// Exchange code first, then redirect to dashboard
			// This ensures session is established before redirect
				supabase.auth.exchangeCodeForSession(code)
				.then((response: { data: any; error: any }) => {
					if (response.error) {
						console.error('Error exchanging code:', response.error);
						const redirectParam = safeRedirectTo ? `&redirect_to=${encodeURIComponent(safeRedirectTo)}` : '';
						router.replace(`/sign-in?error=oauth_error${redirectParam}`);
						return;
					}
					
					if (safeRedirectTo) {
						// Keep auth=loading so destination shows interstitial until session is ready
						const destination = safeRedirectTo === '/connections'
							? '/connections?reauth=true&auth=loading'
							: `${safeRedirectTo}${safeRedirectTo.includes('?') ? '&' : '?'}auth=loading`;
						console.log('Session established, redirecting:', destination);
						router.replace(destination);
						return;
					}
					
					// Session established - redirect to dashboard with loading state
					// Dashboard shows interstitial (skeleton) until session is ready; does not drop to sign-in
					console.log('Session established, redirecting to dashboard');
					router.replace('/dashboard?auth=loading');
				})
				.catch((err: unknown) => {
					console.error('Exception exchanging code:', err);
					const redirectParam = safeRedirectTo ? `&redirect_to=${encodeURIComponent(safeRedirectTo)}` : '';
					router.replace(`/sign-in?error=oauth_error${redirectParam}`);
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
			router.replace(`/sign-in?${params.toString()}`);
			return;
		}

		// If still no recognized parameters, redirect to login
		console.warn('Callback page loaded with no recognized parameters, redirecting to login');
		if (typeof window !== 'undefined') {
			console.log('Current URL:', window.location.href);
			console.log('Search params:', Object.fromEntries(currentUrl.searchParams));
		}
		router.replace('/sign-in');
	}, [router, searchParams, supabase]);

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-bg text-center px-6">
			<div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" aria-hidden />
			<h1 className="mt-6 text-lg font-semibold text-text">Completing sign in</h1>
			<p className="mt-2 text-sm text-text-dim">You’ll be redirected to your dashboard in a moment.</p>
			<p className="mt-8 text-xs text-text-dim/70">If nothing happens, check your connection and try again.</p>
		</div>
	);
}

export default function CallbackPage() {
	return (
		<Suspense fallback={
			<div className="flex flex-col items-center justify-center min-h-screen bg-bg text-center px-6">
				<div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" aria-hidden />
				<h1 className="mt-6 text-lg font-semibold text-text">Loading</h1>
				<p className="mt-2 text-sm text-text-dim">Preparing your session...</p>
			</div>
		}>
			<CallbackHandler />
		</Suspense>
	);
}

