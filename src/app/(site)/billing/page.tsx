"use client";

import { useMemo, useState } from "react";
import { PRICING, type PlanId } from "@/config/pricing";
import { LoadingButton } from "@/components/LoadingButton";

function PlanCard({
	tier,
	billingCycle,
	onCheckout,
	highlight,
	loading,
}: {
	tier: PlanId;
	billingCycle: "monthly" | "annual";
	onCheckout: (priceId: string) => Promise<void>;
	highlight?: boolean;
	loading?: string | null;
}) {
	const plan = PRICING[billingCycle][tier as keyof typeof PRICING["monthly"]] as any;
	return (
		<div
			className={[
				"card p-6 flex flex-col justify-between border",
				highlight ? "border-primary/50 shadow-glow" : "border-edge/60",
			].join(" ")}
		>
			<div>
				<div className="flex items-baseline justify-between">
					<h3 className="text-lg font-semibold">{plan.name}</h3>
					{highlight && (
						<span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30">
							Most popular
						</span>
					)}
				</div>
				<p className="text-3xl mt-2">{plan.priceText}</p>
				<p className="text-text-dim mt-1">{plan.blurb}</p>
				<ul className="mt-5 space-y-2">
					{plan.features.map((f: string, i: number) => (
						<li key={i} className="flex items-start gap-2">
							<span className="mt-[6px] size-1.5 rounded-full bg-primary/60" />
							<span>{f}</span>
						</li>
					))}
				</ul>
			</div>
			<LoadingButton
				onClick={() => onCheckout(plan.priceId)}
				loading={loading === plan.priceId}
				loadingText="Redirecting..."
				className="mt-6 w-full relative group"
				title="You will be redirected to Stripe for payment"
			>
				<span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-surface border border-edge/60 text-text-soft text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
					You will be redirected to Stripe for payment
				</span>
				Choose {plan.name}
			</LoadingButton>
		</div>
	);
}

export default function BillingPage() {
	const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
	const [loading, setLoading] = useState<string | null>(null);
	const [waitlistOpenPlan, setWaitlistOpenPlan] = useState<string | null>(null);
	const [waitlistEmail, setWaitlistEmail] = useState('');
	const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);

	const goCheckout = async (priceId: string) => {
		setLoading(priceId);
		try {
			const res = await fetch("/api/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ priceId }),
			});
			const data = await res.json();
			if (!res.ok) {
				// If not authenticated, redirect to login
				if (res.status === 401 && data.redirectTo) {
					window.location.href = data.redirectTo;
					return;
				}
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
			alert(err.message || "Checkout failed. Please try again.");
		}
	};

	const ordered = useMemo(() => PRICING.order, []);
	const activePlanIds = useMemo(() => ordered.filter((id) => id === "creator"), [ordered]);
	const comingSoonPlans = [
		{
			name: "Creator+",
			description: "Everything in Creator plus AI image generation.",
			bullets: [
				"All Creator benefits",
				"AI-generated imagery for social posts",
				"Advanced scheduling",
			],
		},
		{
			name: "Growth",
			description: "Multi-channel automation via Buffer integration.",
			bullets: [
				"LinkedIn, Instagram, X, Facebook",
				"Image support across channels",
				"Expanded usage limits",
			],
		},
	];

	const toggleWaitlist = (planName: string) => {
		if (waitlistOpenPlan === planName) {
			setWaitlistOpenPlan(null);
			setWaitlistEmail('');
			setWaitlistStatus('idle');
			setWaitlistMessage(null);
		} else {
			setWaitlistOpenPlan(planName);
			setWaitlistEmail('');
			setWaitlistStatus('idle');
			setWaitlistMessage(null);
		}
	};

	const submitWaitlist = async (planName: string) => {
		const email = waitlistEmail.trim().toLowerCase();
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (!email || !emailRegex.test(email)) {
			setWaitlistStatus('error');
			setWaitlistMessage('Please enter a valid email address.');
			return;
		}

		setWaitlistStatus('loading');
		setWaitlistMessage(null);

		try {
			const res = await fetch('/api/waitlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, plan: planName }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data?.error || 'Failed to join the waitlist.');
			}
			setWaitlistStatus('success');
			setWaitlistMessage('Thanks! We’ll email you as soon as it’s available.');
		} catch (error: any) {
			console.error('Waitlist submission error', error);
			setWaitlistStatus('error');
			setWaitlistMessage(error?.message || 'Failed to join the waitlist.');
		}
	};

	return (
		<div className="mx-auto max-w-5xl">
			{/* Back link */}
			<div className="mb-6">
				<button
					onClick={() => window.history.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>
			
			{/* Hero */}
			<section className="mb-8 rounded-xl2 border border-edge/60 p-6 bg-gradient-to-br from-surface/70 to-surface/30">
				<h1 className="text-2xl font-semibold">Choose your plan</h1>
				<p className="text-text-dim mt-1">
					Scale content from idea → publish. Plans include Stripe-backed billing, secure auth,
					and simple limits you can upgrade anytime.
				</p>
				{/* Toggle */}
				<div className="mt-4 inline-flex rounded-xl2 border border-edge/60 bg-bg/40">
					<button
						onClick={() => setCycle("monthly")}
						className={[
							"px-4 py-2 rounded-xl2 text-sm",
							cycle === "monthly" ? "bg-primary/15 border border-primary/30" : "text-text-soft",
						].join(" ")}
					>
						Monthly
					</button>
					<button
						onClick={() => setCycle("annual")}
						className={[
							"px-4 py-2 rounded-xl2 text-sm",
							cycle === "annual" ? "bg-primary/15 border border-primary/30" : "text-text-soft",
						].join(" ")}
					>
						Annual <span className="ml-1 opacity-70">– Save ~20%</span>
					</button>
				</div>
			</section>

			{/* Active plan */}
			<section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
				{activePlanIds.map((id) => (
					<PlanCard
						key={id}
						tier={id}
						billingCycle={cycle}
						onCheckout={goCheckout}
						highlight
						loading={loading}
					/>
				))}
			</section>

			{/* Coming soon */}
			<section className="mt-8">
				<h2 className="text-sm font-semibold text-text-soft uppercase tracking-widest mb-3">Coming soon</h2>
				<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{comingSoonPlans.map((plan) => {
						const isOpen = waitlistOpenPlan === plan.name;
						return (
							<div key={plan.name} className="card p-6 border border-edge/60 bg-surface/30 space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold">{plan.name}</h3>
								<span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 border border-warning/40 text-warning">Soon</span>
							</div>
							<p className="text-text-dim mt-2 text-sm">{plan.description}</p>
							<ul className="mt-4 space-y-2 text-sm">
								{plan.bullets.map((item) => (
									<li key={item} className="flex items-start gap-2">
										<span className="mt-[6px] size-1.5 rounded-full bg-edge/60" />
										<span>{item}</span>
									</li>
								))}
							</ul>
							<div className="space-y-3">
								{isOpen && (
									<form
										onSubmit={(e) => {
											e.preventDefault();
											submitWaitlist(plan.name);
										}}
										className="space-y-2"
									>
										<input
											type="email"
											value={waitlistEmail}
											onChange={(e) => setWaitlistEmail(e.target.value)}
											placeholder="you@example.com"
											className="w-full rounded-xl2 border border-edge/60 bg-bg/80 px-4 py-2 text-sm focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
											required
										/>
										<button
											type="submit"
											disabled={waitlistStatus === 'loading'}
											className="w-full rounded-xl2 border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-text hover:bg-primary/20 transition disabled:opacity-60"
										>
											{waitlistStatus === 'loading' ? 'Joining…' : 'Submit'}
										</button>
										{waitlistStatus === 'success' && waitlistMessage && (
											<p className="text-xs text-emerald-400">{waitlistMessage}</p>
										)}
										{waitlistStatus === 'error' && waitlistMessage && (
											<p className="text-xs text-danger">{waitlistMessage}</p>
										)}
									</form>
								)}
								<button
									type="button"
									onClick={() => toggleWaitlist(plan.name)}
									className="w-full rounded-xl2 border border-edge/60 bg-surface/40 px-4 py-2 text-sm text-text hover:bg-surface/60 transition"
								>
									{isOpen ? 'Close' : 'Join waitlist'}
								</button>
							</div>
						</div>
						);
					})}
				</div>
			</section>

			{/* Footnotes */}
			<div className="text-xs text-text-dim mt-6 space-y-2">
				<p>
					Taxes may apply. You can upgrade/downgrade anytime. By subscribing you agree to our Terms & Privacy.
				</p>
				<p>
					Payment is collected via Stripe using a credit or debit card, merchant name on your statement will be ABL International.
				</p>
			</div>
		</div>
	);
}


