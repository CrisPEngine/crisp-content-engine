'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from './SupabaseProvider';

/**
 * Client-side component that waits for session to be established
 * after OAuth callback, then refreshes the page to show content
 */
export function AuthLoadingHandler() {
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
					// Session established - remove auth=loading param and refresh
					console.log('Session established, refreshing page');
					router.replace('/dashboard');
					return;
				}

				checkCount++;
				if (checkCount < maxChecks) {
					// Check again in 500ms
					timeoutId = setTimeout(checkSession, 500);
				} else {
					// Timeout - redirect to login
					console.warn('Session not established after timeout, redirecting to login');
					router.replace('/login?error=session_timeout');
				}
			} catch (error) {
				console.error('Error checking session:', error);
				router.replace('/login?error=session_error');
			}
		};

		// Start checking after a short delay to allow code exchange to complete
		timeoutId = setTimeout(checkSession, 300);

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [isAuthLoading, supabase, router]);

	return null; // This component doesn't render anything
}
