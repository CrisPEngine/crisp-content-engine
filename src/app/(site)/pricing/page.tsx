import { redirect } from 'next/navigation';

async function createCheckout(priceId: string) {
	'use server';
	const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/checkout`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ priceId }),
		cache: 'no-store',
	});
	if (!res.ok) return;
	const data = await res.json();
	if (data?.url) redirect(data.url);
}

export default function PricingPage() {
	return (
		<div className="mx-auto max-w-3xl">
			<h1 className="text-3xl font-semibold mb-6">Pricing</h1>
			<div className="grid gap-6 md:grid-cols-2">
				<section className="card p-6">
					<h2 className="text-xl font-medium">Starter</h2>
					<p className="text-text-dim mt-1">Good for getting started.</p>
					<form action={async () => {
						'use server';
						await createCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || '');
					}}>
						<button className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm">Subscribe</button>
					</form>
				</section>
				<section className="card p-6">
					<h2 className="text-xl font-medium">Pro</h2>
					<p className="text-text-dim mt-1">For growing teams.</p>
					<form action={async () => {
						'use server';
						await createCheckout(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || '');
					}}>
						<button className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm">Subscribe</button>
					</form>
				</section>
			</div>
			<p className="text-xs text-text-dim mt-6">Prices are examples; wire your Stripe Price IDs in env.</p>
		</div>
	);
}


