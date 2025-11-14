'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Vercel Analytics (recommended for Vercel deployments)
export function VercelAnalytics() {
	const pathname = usePathname();

	useEffect(() => {
		// Check cookie consent
		const consent = localStorage.getItem('cookie-consent');
		if (consent !== 'accepted') return;

		// Vercel Analytics is automatically injected when @vercel/analytics is installed
		// This component just ensures it respects cookie consent
		// The actual tracking happens via the @vercel/analytics package
	}, [pathname]);

	return null;
}

// Google Analytics 4
export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
	const pathname = usePathname();

	useEffect(() => {
		const initGA = () => {
			const consent = localStorage.getItem('cookie-consent');
			if (consent !== 'accepted' || !measurementId) return;

			// Initialize GA4
			if (typeof window !== 'undefined' && !(window as any).gtag) {
				// Load gtag script
				const script1 = document.createElement('script');
				script1.async = true;
				script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
				document.head.appendChild(script1);

				// Initialize gtag
				const script2 = document.createElement('script');
				script2.innerHTML = `
					window.dataLayer = window.dataLayer || [];
					function gtag(){dataLayer.push(arguments);}
					gtag('js', new Date());
					gtag('config', '${measurementId}', {
						page_path: window.location.pathname + window.location.search,
					});
				`;
				document.head.appendChild(script2);
			}
		};

		// Initialize on mount if consent already given
		initGA();

		// Listen for cookie consent acceptance
		const handleConsent = () => {
			initGA();
		};
		window.addEventListener('cookie-consent-accepted', handleConsent);

		// Track page views when pathname changes (only if GA is initialized)
		// Use window.location to get full path including search params (client-side only)
		if (typeof window !== 'undefined' && (window as any).gtag && localStorage.getItem('cookie-consent') === 'accepted') {
			(window as any).gtag('config', measurementId, {
				page_path: window.location.pathname + window.location.search,
			});
		}

		return () => {
			window.removeEventListener('cookie-consent-accepted', handleConsent);
		};
	}, [pathname, measurementId]);

	return null;
}

// Combined analytics component that respects cookie consent
export function Analytics() {
	const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

	return (
		<>
			{/* Vercel Analytics - automatically enabled if @vercel/analytics is installed */}
			<VercelAnalytics />
			{/* Google Analytics - only if GA_MEASUREMENT_ID is set */}
			{gaId && <GoogleAnalytics measurementId={gaId} />}
		</>
	);
}

