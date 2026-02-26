"use client";

import { useMemo, useState, useEffect } from "react";
import { PRICING, type PlanId } from "@/config/pricing";
import { LoadingButton } from "@/components/LoadingButton";
import { useSupabase } from "@/components/SupabaseProvider";
import { ChevronDown, ChevronUp, Check } from "lucide-react";

// Plans available for Stripe checkout
const PURCHASABLE_PLANS: PlanId[] = ["creator", "growth", "pro"];

function Badge({ label, variant = "soon" }: { label: string; variant?: "soon" | "popular" }) {
	if (variant === "popular") {
		return (
			<span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">
				Most popular
			</span>
		);
	}
	return (
		<span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 border border-warning/40 text-warning">
			{label}
		</span>
	);
}

function ComingSoonBadge({ item }: { item: string }) {
	return (
		<li className="flex items-start gap-2 opacity-60">
			<span className="mt-[6px] size-1.5 rounded-full bg-edge/60 flex-shrink-0" />
			<span className="flex items-center gap-1.5">
				{item}
				<span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-edge/40 text-text-dim leading-none">
					Soon
				</span>
			</span>
		</li>
	);
}

function StarterCard() {
	return (
		<div className="card p-6 flex flex-col justify-between border border-edge/60">
			<div>
				<div className="flex items-baseline justify-between">
					<h3 className="text-lg font-semibold">Starter</h3>
					<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
						Free Forever
					</span>
				</div>
				<p className="text-3xl mt-2 font-bold">Free</p>
				<p className="text-text-dim mt-1 text-sm">For founders getting consistent with structure.</p>
				<ul className="mt-5 space-y-2 text-sm">
					{PRICING.monthly.starter.features.map((f, i) => (
						<li key={i} className="flex items-start gap-2">
							<Check className="size-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
							<span>{f}</span>
						</li>
					))}
				</ul>
				{PRICING.monthly.starter.footnote && (
					<p className="mt-4 text-xs text-text-dim italic">{PRICING.monthly.starter.footnote}</p>
				)}
			</div>
			<a
				href="/signup"
				className="mt-6 w-full inline-flex items-center justify-center rounded-xl2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 transition"
			>
				Start free — no card required
			</a>
		</div>
	);
}

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
	const plan = PRICING[billingCycle][tier as keyof (typeof PRICING)["monthly"]] as any;
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
					{highlight && <Badge variant="popular" label="Most popular" />}
				</div>
				<p className="text-3xl mt-2 font-bold">{plan.priceText}</p>
				<p className="text-text-dim mt-1 text-sm">{plan.blurb}</p>
				<ul className="mt-5 space-y-2 text-sm">
					{(plan.features as string[]).map((f: string, i: number) => (
						<li key={i} className="flex items-start gap-2">
							<Check className="size-3.5 mt-0.5 text-primary flex-shrink-0" />
							<span>{f}</span>
						</li>
					))}
					{(plan.comingSoon as string[])?.map((item: string, i: number) => (
						<ComingSoonBadge key={i} item={item} />
					))}
				</ul>
			</div>
			<LoadingButton
				onClick={() => onCheckout(plan.priceId)}
				loading={loading === plan.priceId}
				loadingText="Redirecting…"
				className="mt-6 w-full"
				title="Redirected to Stripe for payment"
			>
				{plan.cta || `Choose ${plan.name}`}
			</LoadingButton>
		</div>
	);
}

function ScaleCard() {
	return (
		<div className="card p-6 flex flex-col justify-between border border-edge/60 bg-surface/30">
			<div>
				<div className="flex items-baseline justify-between">
					<h3 className="text-lg font-semibold">Scale</h3>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-edge/40 text-text-dim">
						Contact sales
					</span>
				</div>
				<p className="text-3xl mt-2 font-bold text-text-dim">Custom</p>
				<p className="text-text-dim mt-1 text-sm">
					For teams and agencies that need custom limits and support.
				</p>
				<ul className="mt-5 space-y-2 text-sm">
					{PRICING.monthly.scale.features.map((f, i) => (
						<li key={i} className="flex items-start gap-2">
							<Check className="size-3.5 mt-0.5 text-text-dim flex-shrink-0" />
							<span>{f}</span>
						</li>
					))}
				</ul>
			</div>
			<a
				href="mailto:enquiries@crispdigital.io"
				className="mt-6 w-full inline-flex items-center justify-center rounded-xl2 border border-edge/60 bg-surface/40 px-4 py-2.5 text-sm font-medium text-text hover:bg-surface/60 transition"
			>
				Email enquiries@crispdigital.io
			</a>
		</div>
	);
}

function FAQItem({ q, a }: { q: string; a: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="border-b border-edge/40 last:border-0">
			<button
				onClick={() => setOpen(!open)}
				className="w-full flex items-center justify-between py-4 text-left gap-4"
			>
				<span className="font-medium text-sm">{q}</span>
				{open ? (
					<ChevronUp className="size-4 text-text-dim flex-shrink-0" />
				) : (
					<ChevronDown className="size-4 text-text-dim flex-shrink-0" />
				)}
			</button>
			{open && (
				<p className="pb-4 text-sm text-text-dim leading-relaxed">{a}</p>
			)}
		</div>
	);
}

const FAQ_ITEMS = [
	{
		q: "Is Starter really free forever?",
		a: "Yes. No credit card required. Starter is free for as long as you use it.",
	},
	{
		q: "What counts as a \"post\"?",
		a: "A generated content item for that channel. For LinkedIn and Meta, quota is consumed when you approve to publish. For X and Blog, quota is consumed when content is generated.",
	},
	{
		q: "Does Meta mean Facebook and Instagram?",
		a: "Yes. Growth and Pro include a shared Meta pool you can use across Facebook and Instagram in any combination.",
	},
	{
		q: "Can I publish to X?",
		a: "Export is supported on all plans. Auto-publish to X is not yet enabled.",
	},
	{
		q: "Do unused posts roll over?",
		a: "No. Limits reset monthly based on your billing cycle (or calendar month for Starter).",
	},
	{
		q: "Can I manage multiple brands?",
		a: "Pro supports up to 3 brands. Scale supports custom brands. Starter, Creator, and Growth support 1 brand.",
	},
	{
		q: "What are the two seats on Pro?",
		a: "Pro includes 2 active members (seats). An additional seat invite is included so you can add a collaborator or VA. Multi-seat management UI is coming soon.",
	},
	{
		q: "Are Single idea, Comment engine and Reporting available?",
		a: "Not yet. They are on the roadmap and will be added to eligible plans when ready.",
	},
	{
		q: "How does the blog outline differ from a blog article?",
		a: "Starter generates a structured blog outline — a plan for an article you write yourself. Creator and above generate full blog articles ready to publish.",
	},
];

export default function BillingPage() {
	const supabase = useSupabase();
	const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
	const [loading, setLoading] = useState<string | null>(null);
	const [currentPlan, setCurrentPlan] = useState<{
		plan: PlanId | "free";
		cycle: "monthly" | "annual";
		currentPeriodEnd?: string;
	} | null>(null);
	const [loadingPlan, setLoadingPlan] = useState(true);
	const [cancelling, setCancelling] = useState(false);

	useEffect(() => {
		if (!supabase) return;
		async function loadCurrentPlan() {
			try {
				const res = await fetch("/api/plan", { cache: "no-store" });
				if (res.ok) {
					const data = await res.json();
					const planName = data.planName?.toLowerCase() || "free";
					const planId: PlanId | "free" =
						planName === "starter"
							? "starter"
							: planName === "creator"
							? "creator"
							: planName === "growth"
							? "growth"
							: planName === "pro"
							? "pro"
							: planName === "scale"
							? "scale"
							: "free";

					const {
						data: { user },
					} = await supabase.auth.getUser();
					if (user) {
						const { data: sub } = await supabase
							.from("subscriptions")
							.select("plan, cycle, current_period_end")
							.eq("user_id", user.id)
							.maybeSingle();

						if (sub) {
							setCurrentPlan({
								plan: (sub.plan as PlanId) || planId,
								cycle: (sub.cycle as "monthly" | "annual") || data.cycle || "monthly",
								currentPeriodEnd: sub.current_period_end,
							});
							if (sub.cycle) setCycle(sub.cycle as "monthly" | "annual");
						} else {
							setCurrentPlan({ plan: planId, cycle: data.cycle || "monthly" });
						}
					}
				}
			} catch (error) {
				console.error("Failed to load current plan:", error);
			} finally {
				setLoadingPlan(false);
			}
		}
		loadCurrentPlan();
	}, [supabase]);

	const goCheckout = async (priceId: string) => {
		if (!priceId) return;
		setLoading(priceId);
		try {
			const res = await fetch("/api/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ priceId }),
			});
			const data = await res.json();
			if (!res.ok) {
				if (res.status === 401 && data.redirectTo) {
					window.location.href = data.redirectTo;
					return;
				}
				throw new Error(data.error || "Checkout failed");
			}
			if (data.url) {
				window.location.href = data.url;
			} else {
				throw new Error("No checkout URL returned");
			}
		} catch (err: any) {
			console.error(err);
			setLoading(null);
			alert(err.message || "Checkout failed. Please try again.");
		}
	};

	const handleCancelSubscription = async () => {
		if (
			!confirm(
				"Are you sure you want to cancel? Your subscription stays active until the end of the current billing cycle."
			)
		)
			return;
		setCancelling(true);
		try {
			const res = await fetch("/api/billing/portal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to open billing portal");
			if (data.url) window.location.href = data.url;
		} catch (error: any) {
			alert(error.message || "Failed to open billing portal. Please try again.");
			setCancelling(false);
		}
	};

	const formatPeriodEnd = (dateString?: string) => {
		if (!dateString) return "";
		try {
			return new Date(dateString).toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return "";
		}
	};

	const planDisplayNames: Record<string, string> = {
		starter: "Starter",
		creator: "Creator",
		growth: "Growth",
		pro: "Pro",
		scale: "Scale",
		free: "Free",
		trial: "Trial",
	};

	// Determine which purchasable plans to show as upgrade options
	const upgradeOptions = useMemo((): PlanId[] => {
		if (!currentPlan || currentPlan.plan === "free" || currentPlan.plan === "trial") {
			return PURCHASABLE_PLANS;
		}
		const order: PlanId[] = ["starter", "creator", "growth", "pro", "scale"];
		const currentIdx = order.indexOf(currentPlan.plan as PlanId);
		return PURCHASABLE_PLANS.filter((id) => order.indexOf(id) > currentIdx);
	}, [currentPlan]);

	const isOnPaidPlan =
		currentPlan &&
		currentPlan.plan !== "free" &&
		currentPlan.plan !== "trial" &&
		currentPlan.plan !== "starter";

	return (
		<div className="mx-auto max-w-5xl">
			{/* Back */}
			<div className="mb-6">
				<button
					onClick={() => window.history.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			{/* Current plan banner */}
			{!loadingPlan && isOnPaidPlan && (
				<section className="mb-8 rounded-xl2 border border-primary/30 p-6 bg-gradient-to-br from-primary/10 to-primary/5">
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<div className="flex-1">
							<h2 className="text-xl font-semibold mb-1">Current Plan</h2>
							<p className="text-lg font-medium text-text-soft">
								{planDisplayNames[currentPlan!.plan]} ({currentPlan!.cycle})
							</p>
							{currentPlan!.currentPeriodEnd && (
								<p className="text-sm text-text-dim mt-1">
									Current period ends: {formatPeriodEnd(currentPlan!.currentPeriodEnd)}
								</p>
							)}
						</div>
						<div className="flex flex-col items-end gap-2">
							<button
								onClick={handleCancelSubscription}
								disabled={cancelling}
								className="px-3 py-1.5 rounded-lg border border-edge/40 bg-transparent hover:bg-surface/30 text-text-dim hover:text-text-soft text-xs transition disabled:opacity-50"
							>
								{cancelling ? "Opening…" : "Cancel Subscription"}
							</button>
							<p className="text-xs text-text-dim text-right max-w-[200px]">
								Cancellation takes effect at end of billing cycle
							</p>
						</div>
					</div>
				</section>
			)}

			{/* Hero */}
			<section className="mb-8 rounded-xl2 border border-edge/60 p-6 bg-gradient-to-br from-surface/70 to-surface/30">
				<h1 className="text-2xl font-semibold">Visibility without compromise. Consistency by design.</h1>
				<p className="text-text-dim mt-2">
					Build and publish content across LinkedIn, X, Blog and Meta. Start free. No credit card required.
				</p>

				{/* Billing cycle toggle */}
				<div className="mt-5 inline-flex rounded-xl2 border border-edge/60 bg-bg/40">
					<button
						onClick={() => setCycle("monthly")}
						className={[
							"px-4 py-2 rounded-xl2 text-sm transition",
							cycle === "monthly" ? "bg-primary/15 border border-primary/30" : "text-text-soft",
						].join(" ")}
					>
						Monthly
					</button>
					<button
						onClick={() => setCycle("annual")}
						className={[
							"px-4 py-2 rounded-xl2 text-sm transition",
							cycle === "annual" ? "bg-primary/15 border border-primary/30" : "text-text-soft",
						].join(" ")}
					>
						Annual <span className="ml-1 opacity-70">– Save ~17%</span>
					</button>
				</div>
			</section>

			{/* Plan cards */}
			{upgradeOptions.length > 0 ? (
				<section>
					<h2 className="text-lg font-semibold mb-4">
						{isOnPaidPlan ? "Available Upgrades" : "Choose your plan"}
					</h2>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
						{!isOnPaidPlan && <StarterCard />}
						{upgradeOptions.map((id) => (
							<PlanCard
								key={id}
								tier={id}
								billingCycle={cycle}
								onCheckout={goCheckout}
								highlight={id === "growth"}
								loading={loading}
							/>
						))}
						{!isOnPaidPlan && <ScaleCard />}
					</div>
				</section>
			) : (
				<section>
					<h2 className="text-lg font-semibold mb-4">All plans</h2>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
						<StarterCard />
						{PURCHASABLE_PLANS.map((id) => (
							<PlanCard
								key={id}
								tier={id}
								billingCycle={cycle}
								onCheckout={goCheckout}
								highlight={id === "growth"}
								loading={loading}
							/>
						))}
						<ScaleCard />
					</div>
				</section>
			)}

			{/* FAQ */}
			<section className="mt-12">
				<h2 className="text-lg font-semibold mb-4">Frequently asked questions</h2>
				<div className="rounded-xl2 border border-edge/60 bg-surface/20 divide-y divide-edge/40 px-5">
					{FAQ_ITEMS.map((item) => (
						<FAQItem key={item.q} q={item.q} a={item.a} />
					))}
				</div>
			</section>

			{/* Stripe notes for paid plans */}
			{isOnPaidPlan && (
				<section className="mt-8">
					<h2 className="text-sm font-semibold text-text-soft uppercase tracking-widest mb-3">
						Other plans
					</h2>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
						<StarterCard />
						{PURCHASABLE_PLANS.filter((id) => {
							const order: PlanId[] = ["creator", "growth", "pro"];
							const currentIdx = order.indexOf(currentPlan!.plan as PlanId);
							return order.indexOf(id) > currentIdx;
						}).map((id) => (
							<PlanCard
								key={id}
								tier={id}
								billingCycle={cycle}
								onCheckout={goCheckout}
								highlight={id === "growth"}
								loading={loading}
							/>
						))}
						<ScaleCard />
					</div>
				</section>
			)}

			{/* Footnotes */}
			<div className="text-xs text-text-dim mt-8 space-y-2">
				<p>
					Taxes may apply. Upgrade or cancel anytime. By subscribing you agree to our Terms &amp; Privacy.
				</p>
				<p>
					Payment collected via Stripe. Merchant name on statement: ABL International.
				</p>
			</div>
		</div>
	);
}
