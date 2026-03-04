"use client";

import { useState } from "react";
import { LoadingButton } from "./LoadingButton";

type UpgradeModalProps = {
	isOpen: boolean;
	onClose: () => void;
	reason?: string;
	channel?: string;
};

export function UpgradeModal({ isOpen, onClose, reason, channel }: UpgradeModalProps) {
	const [loading, setLoading] = useState<string | null>(null);

	if (!isOpen) return null;

	const handleCheckout = async (planType: 'starter' | 'creator') => {
		setLoading(planType);
		try {
			// Get price IDs from env (client-side)
			const priceId =
				planType === 'starter'
					? process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY
					: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY;

			if (!priceId) {
				throw new Error('Price ID not configured');
			}

			const res = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ priceId }),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Checkout failed');
			}

			if (data.url) {
				window.location.href = data.url;
			} else {
				throw new Error('No checkout URL returned');
			}
		} catch (err: any) {
			console.error(err);
			setLoading(null);
			alert(err.message || 'Checkout failed. Please try again.');
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="relative w-full max-w-2xl mx-4 p-6 rounded-xl border border-edge/60 bg-surface shadow-2xl">
				{/* Close button */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 text-text-dim hover:text-text transition"
					aria-label="Close"
				>
					<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>

				{/* Header */}
				<h2 className="text-2xl font-semibold mb-2">Upgrade to Continue</h2>
				{reason && (
					<p className="text-text-soft mb-6">{reason}</p>
				)}
				{!reason && (
					<p className="text-text-soft mb-6">
						You've reached your monthly limit. Choose a plan to keep generating content.
					</p>
				)}

				{/* Plans */}
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
					{/* Starter */}
					<div className="p-5 rounded-lg border border-edge/60 bg-bg/40">
						<h3 className="text-lg font-semibold mb-1">Starter</h3>
						<p className="text-3xl font-bold mb-2">$5<span className="text-base text-text-dim">/mo</span></p>
						<p className="text-sm text-text-dim mb-4">Export-only for LinkedIn & X</p>
						<ul className="space-y-2 mb-4 text-sm">
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>8 LinkedIn posts/month</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>8 X posts/month</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>AI image prompts included</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>1 brand profile</span>
							</li>
						</ul>
						<LoadingButton
							onClick={() => handleCheckout('starter')}
							loading={loading === 'starter'}
							loadingText="Redirecting..."
							className="w-full"
						>
							Choose Starter
						</LoadingButton>
					</div>

					{/* Creator */}
					<div className="p-5 rounded-lg border-2 border-primary/50 bg-primary/5 relative">
						<div className="absolute -top-3 left-1/2 -translate-x-1/2">
							<span className="px-3 py-1 rounded-full bg-primary text-white text-xs font-medium">
								Most Popular
							</span>
						</div>
						<h3 className="text-lg font-semibold mb-1">Creator</h3>
						<p className="text-3xl font-bold mb-2">$9<span className="text-base text-text-dim">/mo</span></p>
						<p className="text-sm text-text-dim mb-4">Autopublish to LinkedIn + Blogs</p>
						<ul className="space-y-2 mb-4 text-sm">
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>8 LinkedIn posts/month (autopublish)</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>2 blog articles/month</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>AI image prompts included</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="mt-1 size-1.5 rounded-full bg-primary/60 shrink-0" />
								<span>1 brand profile</span>
							</li>
						</ul>
						<LoadingButton
							onClick={() => handleCheckout('creator')}
							loading={loading === 'creator'}
							loadingText="Redirecting..."
							className="w-full bg-primary hover:bg-primary/90"
						>
							Choose Creator
						</LoadingButton>
					</div>
				</div>

				{/* Footer */}
				<div className="text-center">
					<a
						href="/billing"
						className="text-sm text-text-dim hover:text-text underline"
					>
						View all plans & features
					</a>
				</div>
			</div>
		</div>
	);
}
