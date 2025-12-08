'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function EmailActionCompletePage() {
	const searchParams = useSearchParams();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	const status = searchParams?.get('status');
	const type = searchParams?.get('type');
	const message = searchParams?.get('message');

	const isSuccess = status === 'success';

	let title = 'Action Complete';
	let description = 'Your action has been processed.';
	let actionText = 'Go to Dashboard';

	if (isSuccess) {
		if (type === 'strategy_keep') {
			title = 'Strategy Confirmed';
			description = 'We have confirmed that you want to continue with your existing strategy for next month.';
			actionText = 'View Strategy';
		} else if (type === 'content_approve') {
			title = 'Content Approved';
			description = 'Your content has been approved and will be published according to your schedule.';
			actionText = 'View Content';
		} else if (type === 'approve_all_content') {
			const count = searchParams?.get('count');
			title = 'All Posts Approved';
			description = count 
				? `All ${count} pending post${count !== '1' ? 's' : ''} have been approved and will be published on their scheduled times.`
				: 'All pending posts have been approved and will be published on their scheduled times.';
			actionText = 'View Content';
		}
	} else {
		title = 'Action Failed';
		description = message || 'There was an error processing your action. Please try again.';
		actionText = 'Go to Dashboard';
	}

	return (
		<main className="min-h-screen flex items-center justify-center p-4">
			<div className="card p-8 max-w-md w-full text-center">
				<div className={`w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center ${isSuccess ? 'bg-accent/20' : 'bg-danger/20'}`}>
					{isSuccess ? (
						<svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
						</svg>
					) : (
						<svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					)}
				</div>
				<h1 className="text-2xl font-semibold mb-4">{title}</h1>
				<p className="text-text-dim mb-8">{description}</p>
				<Link
					href={type === 'strategy_keep' ? '/strategy/monthly-update' : (type === 'content_approve' || type === 'approve_all_content') ? '/content/approval' : '/dashboard'}
					className="px-6 py-3 rounded-xl2 bg-primary hover:bg-primary/90 text-white font-semibold inline-block"
				>
					{actionText}
				</Link>
			</div>
		</main>
	);
}

