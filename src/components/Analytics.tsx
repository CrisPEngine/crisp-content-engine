'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics as VercelAnalyticsComponent } from '@vercel/analytics/react';

// Vercel Analytics wrapper that respects cookie consent
export function VercelAnalytics() {
	const [hasConsent, setHasConsent] = useState(false);

	useEffect(() => {
		// Check initial consent
		const checkConsent = () => {
			const consent = localStorage.getItem('cookie-consent');
			setHasConsent(consent === 'accepted');
		};

		checkConsent();

		// Listen for cookie consent acceptance
		const handleConsent = () => {
			setHasConsent(true);
		};
		window.addEventListener('cookie-consent-accepted', handleConsent);

		return () => {
			window.removeEventListener('cookie-consent-accepted', handleConsent);
		};
	}, []);

	// Only render Vercel Analytics if consent is given
	if (!hasConsent) return null;

	return <VercelAnalyticsComponent />;
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

