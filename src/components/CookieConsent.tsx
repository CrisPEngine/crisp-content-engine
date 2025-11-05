"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CookieConsent() {
	const [show, setShow] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem('cookie-consent');
		if (!consent) {
			setShow(true);
		}
	}, []);

	const accept = () => {
		localStorage.setItem('cookie-consent', 'accepted');
		setShow(false);
	};

	if (!show) return null;

	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 p-4">
			<div className="mx-auto max-w-5xl">
				<div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
					<div className="flex-1 min-w-[200px]">
						<p className="text-sm text-text-soft">
							We use cookies to enhance your experience. By continuing, you agree to our{' '}
							<Link href="https://www.crispdigital.io/privacy-policy" target="_blank" className="text-primary hover:underline">
								Privacy Policy
							</Link>
							.
						</p>
					</div>
					<button
						onClick={accept}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 text-sm hover:bg-primary/20 whitespace-nowrap"
					>
						Accept
					</button>
				</div>
			</div>
		</div>
	);
}

