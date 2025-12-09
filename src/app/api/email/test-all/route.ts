/**
 * Test Email Endpoint
 * 
 * Sends all email templates to a test email address for review.
 * 
 * Security: Should be disabled in production or protected with admin auth
 * 
 * Usage: POST /api/email/test-all
 * Body: { email?: string } (defaults to pascoe.chris@gmail.com)
 */

import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/sendEmail';
import { AuthInviteEmail } from '@/emails/auth/AuthInviteEmail';
import { AuthMagicLinkEmail } from '@/emails/auth/AuthMagicLinkEmail';
import { AuthPasswordResetEmail } from '@/emails/auth/AuthPasswordResetEmail';
import { ContentApprovalDigestEmail, ContentApprovalItem } from '@/emails/product/ContentApprovalDigestEmail';
import { ContentBatchReadyEmail, ContentBatchItem } from '@/emails/product/ContentBatchReadyEmail';
import { OAuthReconnectEmail } from '@/emails/product/OAuthReconnectEmail';
import { StrategyReminderEmail } from '@/emails/product/StrategyReminderEmail';
import { generateEmailActionUrl } from '@/lib/email/tokenSigning';

export const runtime = 'nodejs';

const TEST_EMAIL = 'pascoe.chris@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => ({}));
		const testEmail = body.email || TEST_EMAIL;

		const results: Array<{ template: string; status: string; error?: string; resendId?: string }> = [];
		const timestamp = Date.now();

		// Helper to add delay between emails to avoid rate limiting
		const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

		// Test 1: AuthInviteEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 1/7] ${timestamp} - You have been invited to CRISP Content Engine`,
				react: AuthInviteEmail({
					inviteUrl: `${APP_URL}/auth/callback?token=test-invite-token`,
					userEmail: testEmail,
				}),
				category: 'auth',
			});
			results.push({ 
				template: 'AuthInviteEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'AuthInviteEmail', status: 'error', error: error.message });
		}
		await delay(500); // Small delay between emails

		// Test 2: AuthMagicLinkEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 2/7] ${timestamp} - Sign in to CRISP Content Engine`,
				react: AuthMagicLinkEmail({
					magicLinkUrl: `${APP_URL}/auth/callback?token=test-magic-token`,
					userEmail: testEmail,
				}),
				category: 'auth',
			});
			results.push({ 
				template: 'AuthMagicLinkEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'AuthMagicLinkEmail', status: 'error', error: error.message });
		}
		await delay(500);

		// Test 3: AuthPasswordResetEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 3/7] ${timestamp} - Reset your CRISP Content Engine password`,
				react: AuthPasswordResetEmail({
					resetUrl: `${APP_URL}/auth/reset?token=test-reset-token`,
					userEmail: testEmail,
				}),
				category: 'auth',
			});
			results.push({ 
				template: 'AuthPasswordResetEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'AuthPasswordResetEmail', status: 'error', error: error.message });
		}
		await delay(500);

		// Test 4: ContentApprovalDigestEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 4/7] ${timestamp} - You have 3 posts waiting for approval`,
				react: ContentApprovalDigestEmail({
					userName: 'Chris',
					pendingCount: 3,
					items: [
						{
							id: 'test-1',
							platform: 'LinkedIn',
							title: '5 Ways to Improve Your Content Strategy',
							shortPreview: 'Content strategy is crucial for business growth. Here are five proven methods to enhance your approach and drive better results...',
							scheduledTime: 'Mar 15, 2:00 PM',
							viewUrl: `${APP_URL}/content/approval`,
							approveUrl: generateEmailActionUrl({
								baseUrl: APP_URL,
								userId: 'test-user-id',
								action: 'content/approve',
								resourceId: 'test-1',
							}),
						},
						{
							id: 'test-2',
							platform: 'X (Twitter)',
							title: 'Quick tip: Content planning',
							shortPreview: 'Planning your content in advance saves time and improves consistency. Start with a content calendar...',
							scheduledTime: 'Mar 16, 10:00 AM',
							viewUrl: `${APP_URL}/content/approval`,
							approveUrl: generateEmailActionUrl({
								baseUrl: APP_URL,
								userId: 'test-user-id',
								action: 'content/approve',
								resourceId: 'test-2',
							}),
						},
						{
							id: 'test-3',
							platform: 'LinkedIn',
							title: 'The Future of Social Media Marketing',
							shortPreview: 'As social media continues to evolve, marketers need to adapt their strategies. Here\'s what to expect...',
							scheduledTime: undefined,
							viewUrl: `${APP_URL}/content/approval`,
							approveUrl: generateEmailActionUrl({
								baseUrl: APP_URL,
								userId: 'test-user-id',
								action: 'content/approve',
								resourceId: 'test-3',
							}),
						},
					],
					dashboardUrl: `${APP_URL}/content/approval`,
					approveAllUrl: generateEmailActionUrl({
						baseUrl: APP_URL,
						userId: 'test-user-id',
						action: 'content/approve-all',
						resourceId: 'test-1,test-2,test-3',
					}),
				}),
				category: 'content',
			});
			results.push({ 
				template: 'ContentApprovalDigestEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'ContentApprovalDigestEmail', status: 'error', error: error.message });
		}
		await delay(500);

		// Test 5: ContentBatchReadyEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 5/7] ${timestamp} - Your new content batch for Acme Corp is ready for review`,
				react: ContentBatchReadyEmail({
					userName: 'Chris',
					brandName: 'Acme Corp',
					itemCount: 15,
					items: [
						{
							id: 'batch-1',
							platform: 'LinkedIn',
							title: 'Weekly Industry Insights',
							shortPreview: 'This week we explore the latest trends in content marketing and how they impact your strategy...',
						},
						{
							id: 'batch-2',
							platform: 'X (Twitter)',
							title: 'Quick tip: Engagement',
							shortPreview: 'Boost your engagement by asking questions and responding to comments within the first hour...',
						},
						{
							id: 'batch-3',
							platform: 'LinkedIn',
							title: 'Case Study: Success Story',
							shortPreview: 'Learn how one company increased their reach by 300% using our content strategy framework...',
						},
					],
					platforms: ['LinkedIn', 'X (Twitter)', 'Instagram'],
					periodLabel: 'Next 30 days',
					dashboardUrl: `${APP_URL}/content/approval`,
					approveAllUrl: generateEmailActionUrl({
						baseUrl: APP_URL,
						userId: 'test-user-id',
						action: 'content/approve-all',
						resourceId: 'batch-1,batch-2,batch-3',
					}),
				}),
				category: 'content',
			});
			results.push({ 
				template: 'ContentBatchReadyEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'ContentBatchReadyEmail', status: 'error', error: error.message });
		}
		await delay(500);

		// Test 6: OAuthReconnectEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 6/7] ${timestamp} - Action needed: Reconnect your LinkedIn account`,
				react: OAuthReconnectEmail({
					userName: 'Chris',
					provider: 'linkedin',
					issueSummary: 'We could not publish 3 LinkedIn posts because your LinkedIn connection has expired.',
					reconnectUrl: `${APP_URL}/connections`,
					affectedCount: 3,
					firstFailedAt: 'March 10, 2024 at 2:30 PM',
				}),
				category: 'system',
			});
			results.push({ 
				template: 'OAuthReconnectEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'OAuthReconnectEmail', status: 'error', error: error.message });
		}
		await delay(500);

		// Test 7: StrategyReminderEmail
		try {
			const result = await sendEmail({
				to: testEmail,
				subject: `[TEST 7/7] ${timestamp} - Time to confirm your strategy for March 2024`,
				react: StrategyReminderEmail({
					userName: 'Chris',
					monthLabel: 'March 2024',
					strategyUrl: `${APP_URL}/strategy/review`,
					keepStrategyUrl: generateEmailActionUrl({
						baseUrl: APP_URL,
						userId: 'test-user-id',
						action: 'strategy/keep',
						resourceId: 'current-strategy-id',
					}),
					updateStrategyUrl: `${APP_URL}/strategy/update`,
					deadlineLabel: 'by 27 March',
				}),
				category: 'strategy',
			});
			results.push({ 
				template: 'StrategyReminderEmail', 
				status: 'sent',
				resendId: (result as any)?.id || 'unknown'
			});
		} catch (error: any) {
			results.push({ template: 'StrategyReminderEmail', status: 'error', error: error.message });
		}

		const successCount = results.filter(r => r.status === 'sent').length;
		const errorCount = results.filter(r => r.status === 'error').length;

		return NextResponse.json({
			ok: true,
			message: `Test emails sent to ${testEmail}`,
			summary: {
				total: results.length,
				success: successCount,
				errors: errorCount,
			},
			results,
		});
	} catch (error: any) {
		console.error('[Test Emails] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to send test emails' },
			{ status: 500 }
		);
	}
}

