import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { PRICE_TO_PLAN } from '@/config/pricing';
import { extractCustomerAndEmail, upsertUserFromStripe, upsertSubscriptionAndEntitlements } from '@/lib/billing';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2025-10-29.clover',
});

export async function POST(request: Request) {
	const sig = request.headers.get('stripe-signature');
	if (!sig) return new NextResponse('Missing signature', { status: 400 });

	const text = await request.text(); // raw body
	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(
			text,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET!
		);
	} catch (err: any) {
		return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
	}

	// Handle relevant events
		switch (event.type) {
		case 'checkout.session.completed':
		case 'invoice.paid':
		case 'customer.subscription.updated': {
				const obj = event.data.object as any;
			let priceId: string | undefined;
			if (obj?.lines?.data?.[0]?.price?.id) priceId = obj.lines.data[0].price.id;
			if (!priceId && obj?.subscription) {
				const sub = await stripe.subscriptions.retrieve(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id);
				priceId = sub.items.data[0]?.price?.id;
			}
			if (!priceId && obj?.items?.data?.[0]?.price?.id) priceId = obj.items.data[0].price.id;
			const mapping = priceId ? PRICE_TO_PLAN[priceId] : undefined;
				if (!mapping) return NextResponse.json({ ignored: true });
				const { customerId, customerEmail } = extractCustomerAndEmail(obj);
				const profile = await upsertUserFromStripe(customerId, customerEmail);
				const userId = (obj?.metadata?.user_id as string) || (obj?.client_reference_id as string) || profile?.id;
				if (!userId) return NextResponse.json({ ok: true });
				await upsertSubscriptionAndEntitlements({
					userId,
					plan: mapping.plan,
					cycle: mapping.cycle,
					stripeCustomerId: customerId,
					stripeSubscriptionId: typeof obj?.subscription === 'string' ? obj.subscription : obj?.subscription?.id,
					priceId,
					currentPeriodEnd: (obj?.current_period_end as number | undefined),
				});
			break;
		}
		default:
	}

	return NextResponse.json({ received: true });
}


