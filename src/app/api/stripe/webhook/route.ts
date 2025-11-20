import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { PRICE_TO_PLAN } from '@/config/pricing';
import { extractCustomerAndEmail, upsertUserFromStripe, upsertSubscriptionAndEntitlements } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	const stripe = getStripe();
	const sig = request.headers.get('stripe-signature');
	if (!sig) return new NextResponse('Missing signature', { status: 400 });

	const text = await request.text(); // raw body
	let event: import('stripe').Stripe.Event;
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
		case 'checkout.session.completed': {
			// CheckoutSession object - need to get subscription and retrieve it
			const session = event.data.object as any;
			const subscriptionId = session.subscription;
			const userId = (session.metadata?.user_id as string) || (session.client_reference_id as string);
			
			if (!subscriptionId || !userId) {
				console.warn('checkout.session.completed: Missing subscription ID or user ID', { subscriptionId, userId });
				return NextResponse.json({ ok: true, message: 'Missing subscription or user ID' });
			}

			// Retrieve the subscription to get price and details
			const subId = typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id;
			const subscription = await stripe.subscriptions.retrieve(subId) as any;
			const priceId = subscription.items.data[0]?.price?.id;
			if (!priceId) {
				console.warn('checkout.session.completed: No price ID found in subscription');
				return NextResponse.json({ ok: true, message: 'No price ID found' });
			}

			const mapping = PRICE_TO_PLAN[priceId];
			if (!mapping) {
				console.warn('checkout.session.completed: Unknown price ID', priceId);
				return NextResponse.json({ ignored: true, message: 'Unknown price ID' });
			}

			const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
			const customerEmail = session.customer_details?.email || session.customer_email;

			try {
				await upsertSubscriptionAndEntitlements({
					userId,
					plan: mapping.plan,
					cycle: mapping.cycle,
					stripeCustomerId: customerId,
					stripeSubscriptionId: subId,
					priceId,
					currentPeriodEnd: subscription.current_period_end as number | undefined,
				});
				console.log('checkout.session.completed: Successfully created subscription', { userId, plan: mapping.plan, subscriptionId: subId });
			} catch (err: any) {
				console.error('checkout.session.completed: Failed to create subscription', { 
					userId, 
					subscriptionId: subId,
					error: err.message, 
					stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
				});
				// Don't throw - webhook should still return 200 to Stripe to avoid retries
			}

			break;
		}
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'invoice.paid': {
			const obj = event.data.object as any;
			let priceId: string | undefined;
			let subscriptionId: string | undefined;
			let currentPeriodEnd: number | undefined;
			let customerId: string | undefined;
			let customerEmail: string | undefined;

			// Handle different event types
			if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
				// Subscription object
				subscriptionId = obj.id;
				priceId = obj.items?.data?.[0]?.price?.id;
				currentPeriodEnd = obj.current_period_end;
				customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
				
				// For subscription.created, we need to get customer email from Stripe
				if (customerId && !customerEmail) {
					try {
						const customer = await stripe.customers.retrieve(customerId) as any;
						customerEmail = customer.email;
					} catch (err) {
						console.warn(`Failed to retrieve customer ${customerId}:`, err);
					}
				}
			} else if (event.type === 'invoice.paid') {
				// Invoice object
				subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;
				priceId = obj.lines?.data?.[0]?.price?.id;
				customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
				customerEmail = obj.customer_email;
				
				if (!priceId && subscriptionId) {
					const sub = await stripe.subscriptions.retrieve(subscriptionId) as any;
					priceId = sub.items.data[0]?.price?.id;
					currentPeriodEnd = sub.current_period_end as number | undefined;
				}
			}

			if (!priceId) {
				console.warn(`${event.type}: No price ID found`);
				return NextResponse.json({ ignored: true, message: 'No price ID found' });
			}

			const mapping = PRICE_TO_PLAN[priceId];
			if (!mapping) {
				console.warn(`${event.type}: Unknown price ID`, priceId);
				return NextResponse.json({ ignored: true, message: 'Unknown price ID' });
			}

			// Try multiple methods to get user ID
			let userId: string | undefined;
			
			// Method 1: From subscription metadata (set in checkout)
			if (obj?.metadata?.user_id) {
				userId = obj.metadata.user_id;
			}
			
			// Method 2: From customer metadata (if subscription doesn't have it)
			if (!userId && customerId) {
				try {
					const customer = await stripe.customers.retrieve(customerId) as any;
					userId = customer.metadata?.user_id;
				} catch (err) {
					console.warn(`Failed to retrieve customer for user ID:`, err);
				}
			}
			
			// Method 3: From profile lookup by email
			if (!userId && customerEmail) {
				const profile = await upsertUserFromStripe(customerId, customerEmail);
				userId = profile?.id;
			}
			
			if (!userId) {
				console.warn(`${event.type}: No user ID found`, { 
					customerId, 
					customerEmail, 
					subscriptionMetadata: obj?.metadata,
					subscriptionId 
				});
				return NextResponse.json({ ok: true, message: 'No user ID found' });
			}

			try {
				await upsertSubscriptionAndEntitlements({
					userId,
					plan: mapping.plan,
					cycle: mapping.cycle,
					stripeCustomerId: customerId,
					stripeSubscriptionId: subscriptionId,
					priceId,
					currentPeriodEnd,
				});
				console.log(`${event.type}: Successfully created/updated subscription`, { userId, plan: mapping.plan, subscriptionId });
			} catch (err: any) {
				console.error(`${event.type}: Failed to create/update subscription`, { 
					userId,
					subscriptionId,
					error: err.message, 
					stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
				});
				// Don't throw - webhook should still return 200 to Stripe to avoid retries
			}

			// If this is an invoice.paid event (renewal), trigger auto-content generation
			if (event.type === 'invoice.paid' && mapping.cycle === 'monthly') {
				try {
					// Call auto-generate endpoint asynchronously (don't wait for it)
					fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/content/auto-generate`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ userId }),
					}).catch((err) => {
						console.error('Failed to trigger auto-content generation:', err);
						// Don't fail the webhook if this fails
					});
				} catch (error) {
					console.error('Error triggering auto-content generation:', error);
					// Don't fail the webhook if this fails
				}
			}

			break;
		}
		default:
	}

	return NextResponse.json({ received: true });
}


