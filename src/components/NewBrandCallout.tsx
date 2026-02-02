'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { X, RefreshCw } from 'lucide-react';
import { useState } from 'react';

/**
 * Dismissible callout shown when user lands on dashboard after creating a new brand.
 * Tells them they may need to refresh if the new profile isn’t visible yet.
 */
export function NewBrandCallout() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [dismissed, setDismissed] = useState(false);

	const showCallout = searchParams.get('new_brand') === '1' && !dismissed;

	const handleDismiss = () => {
		setDismissed(true);
		const params = new URLSearchParams(searchParams.toString());
		params.delete('new_brand');
		const qs = params.toString();
		router.replace(qs ? `/dashboard?${qs}` : '/dashboard', { scroll: false });
	};

	if (!showCallout) return null;

	return (
		<div className="card p-4 bg-primary/10 border border-primary/30 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
			<div className="flex gap-3 flex-1 min-w-0">
				<RefreshCw className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
				<div>
					<p className="text-sm font-medium text-text">
						New brand profile created
					</p>
					<p className="text-sm text-text-dim mt-0.5">
						If your new profile doesn’t appear in Brand Profiles yet, refresh your browser—it may still be syncing.
					</p>
				</div>
			</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="flex items-center gap-1.5 text-text-dim hover:text-text text-sm flex-shrink-0 self-start sm:self-center"
				aria-label="Dismiss"
			>
				<X className="w-4 h-4" />
				Dismiss
			</button>
		</div>
	);
}
