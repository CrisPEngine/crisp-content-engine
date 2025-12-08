import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { verifyEmailActionToken } from '@/lib/email/tokenSigning';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId');
		const strategyId = url.searchParams.get('resourceId') || url.searchParams.get('strategyId');
		const token = url.searchParams.get('token');

		if (!userId || !strategyId || !token) {
			return redirect('/email-action/complete?status=error&type=strategy_keep&message=Missing parameters');
		}

		// Verify token
		const tokenData = verifyEmailActionToken(token);
		if (!tokenData) {
			return redirect('/email-action/complete?status=error&type=strategy_keep&message=Invalid or expired token');
		}

		// Verify token matches request
		if (tokenData.userId !== userId || tokenData.resourceId !== strategyId || tokenData.action !== 'strategy/keep') {
			return redirect('/email-action/complete?status=error&type=strategy_keep&message=Token mismatch');
		}

		// Verify user exists
		const admin = getSupabaseService();
		const { data: user } = await admin.auth.admin.getUserById(userId);
		if (!user) {
			return redirect('/email-action/complete?status=error&type=strategy_keep&message=User not found');
		}

		// Get user's subscription to find current billing cycle end date
		const { data: subscription } = await admin
			.from('subscriptions')
			.select('current_period_end, plan')
			.eq('user_id', userId)
			.maybeSingle();

		if (!subscription || !subscription.current_period_end) {
			return redirect('/email-action/complete?status=error&type=strategy_keep&message=No active subscription found');
		}

		const cycleEndDate = new Date(subscription.current_period_end).toISOString().split('T')[0];

		// Update strategy_notifications to mark user action
		const { data: notification, error: notificationError } = await admin
			.from('strategy_notifications')
			.select('id')
			.eq('user_id', userId)
			.eq('billing_cycle_end_date', cycleEndDate)
			.maybeSingle();

		if (notificationError) {
			console.error('[Email Action] Error fetching notification:', notificationError);
		}

		if (notification) {
			// Update existing notification
			await admin
				.from('strategy_notifications')
				.update({
					user_action: 'keep',
					user_action_at: new Date().toISOString(),
					strategy_confirmed_for_next_cycle: true,
					brand_profile_id: strategyId !== 'current' ? strategyId : null,
					updated_at: new Date().toISOString(),
				})
				.eq('id', notification.id);
		} else {
			// Create new notification record
			await admin
				.from('strategy_notifications')
				.insert({
					user_id: userId,
					brand_profile_id: strategyId !== 'current' ? strategyId : null,
					billing_cycle_end_date: cycleEndDate,
					user_action: 'keep',
					user_action_at: new Date().toISOString(),
					strategy_confirmed_for_next_cycle: true,
				});
		}

		console.log(`[Email Action] Strategy keep confirmed: userId=${userId}, strategyId=${strategyId}, cycleEndDate=${cycleEndDate}`);

		// Trigger content creation for the confirmed strategy
		if (strategyId && strategyId !== 'current') {
			try {
				// Get LinkedIn connection for this brand
				const { data: linkedInConnection } = await admin
					.from('social_connections')
					.select('person_urn, organization_urn, connection_type, brand_profile_id')
					.eq('brand_profile_id', strategyId)
					.eq('provider', 'linkedin')
					.maybeSingle();

				const { triggerContentCreationForBrand } = await import('@/lib/email/contentCreation');
				await triggerContentCreationForBrand(
					strategyId,
					userId,
					linkedInConnection?.person_urn || null,
					linkedInConnection?.organization_urn || null
				);
			} catch (contentError: any) {
				console.error('[Email Action] Failed to trigger content creation:', contentError);
				// Don't fail the redirect - content creation can be retried
			}
		}

		return redirect('/email-action/complete?status=success&type=strategy_keep');
	} catch (error: any) {
		console.error('[Email Action] Error in strategy keep:', error);
		return redirect('/email-action/complete?status=error&type=strategy_keep&message=' + encodeURIComponent(error.message || 'Unknown error'));
	}
}

