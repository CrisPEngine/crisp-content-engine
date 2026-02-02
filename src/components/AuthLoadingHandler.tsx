'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from './SupabaseProvider';

/**
 * Client-side component that waits for session to be established
 * after OAuth callback, then redirects to the target URL (without auth=loading).
 * Keeps the interstitial visible until session is ready so we never drop to sign-in/reauth.
 */
type AuthLoadingHandlerProps = {
	/** Where to redirect once session is established. Defaults to /dashboard. */
	redirectTo?: string;
};

export function AuthLoadingHandler({ redirectTo = '/dashboard' }: AuthLoadingHandlerProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useSupabase();
	const isAuthLoading = searchParams?.get('auth') === 'loading';

	useEffect(() => {
		if (!isAuthLoading || !supabase) return;

		// Wait for session to be established (with timeout)
		let timeoutId: NodeJS.Timeout;
		let checkCount = 0;
		const maxChecks = 10; // Check for up to 5 seconds (10 * 500ms)

		const checkSession = async () => {
			try {
				const { data: { session } } = await supabase.auth.getSession();
				
				if (session) {
					// Session established - remove auth=loading and show destination
					console.log('Session established, redirecting to', redirectTo);
					router.replace(redirectTo);
					return;
				}

				checkCount++;
				if (checkCount < maxChecks) {
					// Check again in 500ms
					timeoutId = setTimeout(checkSession, 500);
				} else {
					// Timeout - redirect to login
					console.warn('Session not established after timeout, redirecting to login');
					router.replace('/sign-in?error=session_timeout');
				}
			} catch (error) {
				console.error('Error checking session:', error);
				router.replace('/sign-in?error=session_error');
			}
		};

		// Start checking after a short delay to allow code exchange to complete
		timeoutId = setTimeout(checkSession, 300);

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [isAuthLoading, supabase, router, redirectTo]);

	return null; // This component doesn't render anything
}
