/**
 * Retry All Posts That Failed Due to Auth Issues
 * 
 * This endpoint finds all LinkedIn connections that are currently valid
 * (needs_reauth: false) and retries all posts that failed due to auth issues
 * for brands using those connections.
 * 
 * This is useful for pushing posts that failed before the automatic retry
 * feature was implemented.
 * 
 * Security: Requires admin authentication or can be called with a secret
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';
import { retryFailedPostsAfterReconnection } from '@/lib/retryFailedPosts';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

export async function POST(request: Request) {
	try {
		// Authenticate user (optional - can also use secret)
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const {
			data: { user },
		} = await supabase.auth.getUser();

		// Check for secret as alternative auth
		const secret = request.headers.get('x-retry-secret');
		const expectedSecret = process.env.RETRY_FAILED_SECRET;

		if (!user && (!expectedSecret || secret !== expectedSecret)) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// If user is authenticated, check if admin
		if (user) {
			const admin = getSupabaseService();
			const { data: profile } = await admin
				.from('profiles')
				.select('is_admin')
				.eq('id', user.id)
				.maybeSingle();

			if (!profile?.is_admin) {
				return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
			}
		}

		const admin = getSupabaseService();

		// Find all LinkedIn connections that are currently valid (not needing reauth)
		const { data: connections, error: connectionsError } = await admin
			.from('social_connections')
			.select('id, brand_profile_id, user_id, provider, connection_type, account_name')
			.eq('provider', 'linkedin')
			.eq('needs_reauth', false);

		if (connectionsError) {
			console.error('Failed to fetch connections:', connectionsError);
			return NextResponse.json(
				{ error: `Failed to fetch connections: ${connectionsError.message}` },
				{ status: 500 }
			);
		}

		if (!connections || connections.length === 0) {
			return NextResponse.json({
				ok: true,
				message: 'No valid LinkedIn connections found',
				connectionsProcessed: 0,
				totalPostsReset: 0,
			});
		}

		console.log(`[Retry Auth Failed] Found ${connections.length} valid LinkedIn connections`);

		// Group connections by brand_profile_id
		// A connection can have a single brand_profile_id or an array
		const brandProfileToConnections = new Map<string, string[]>();

		for (const connection of connections) {
			const brandProfileIds: string[] = [];

			if (connection.brand_profile_id) {
				if (Array.isArray(connection.brand_profile_id)) {
					brandProfileIds.push(...connection.brand_profile_id);
				} else {
					brandProfileIds.push(connection.brand_profile_id);
				}
			}

			// If no brand_profile_id assigned, skip (connection not yet assigned to a brand)
			if (brandProfileIds.length === 0) {
				console.log(
					`[Retry Auth Failed] Connection ${connection.id} (${connection.account_name || 'unknown'}) has no brand_profile_id, skipping`
				);
				continue;
			}

			// For each brand_profile_id, add this connection
			for (const brandProfileId of brandProfileIds) {
				if (!brandProfileToConnections.has(brandProfileId)) {
					brandProfileToConnections.set(brandProfileId, []);
				}
				brandProfileToConnections.get(brandProfileId)!.push(connection.id);
			}
		}

		console.log(
			`[Retry Auth Failed] Processing ${brandProfileToConnections.size} unique brand profiles`
		);

		// Process each connection and retry failed posts for its brands
		const results: Array<{
			connectionId: string;
			connectionName: string;
			brandProfileIds: string[];
			postsReset: number;
			errors: string[];
		}> = [];

		let totalPostsReset = 0;

		for (const connection of connections) {
			const brandProfileIds: string[] = [];

			if (connection.brand_profile_id) {
				if (Array.isArray(connection.brand_profile_id)) {
					brandProfileIds.push(...connection.brand_profile_id);
				} else {
					brandProfileIds.push(connection.brand_profile_id);
				}
			}

			if (brandProfileIds.length === 0) {
				continue; // Skip connections without brand assignments
			}

			console.log(
				`[Retry Auth Failed] Processing connection ${connection.id} (${connection.account_name || 'unknown'}) for brands: ${brandProfileIds.join(', ')}`
			);

			try {
				const retryResult = await retryFailedPostsAfterReconnection({
					connectionId: connection.id,
					brandProfileIds,
				});

				totalPostsReset += retryResult.reset;

				results.push({
					connectionId: connection.id,
					connectionName: connection.account_name || 'unknown',
					brandProfileIds,
					postsReset: retryResult.reset,
					errors: retryResult.errors,
				});

				if (retryResult.reset > 0) {
					console.log(
						`[Retry Auth Failed] Reset ${retryResult.reset} posts for connection ${connection.id}`
					);
				}
			} catch (error: any) {
				console.error(
					`[Retry Auth Failed] Error processing connection ${connection.id}:`,
					error
				);
				results.push({
					connectionId: connection.id,
					connectionName: connection.account_name || 'unknown',
					brandProfileIds,
					postsReset: 0,
					errors: [error?.message || 'Unknown error'],
				});
			}
		}

		const connectionsWithPosts = results.filter((r) => r.postsReset > 0).length;
		const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

		return NextResponse.json({
			ok: true,
			message: `Processed ${connections.length} connections, reset ${totalPostsReset} posts`,
			connectionsProcessed: connections.length,
			connectionsWithPostsReset: connectionsWithPosts,
			totalPostsReset,
			totalErrors,
			results: results.map((r) => ({
				connectionId: r.connectionId,
				connectionName: r.connectionName,
				brandProfileIds: r.brandProfileIds,
				postsReset: r.postsReset,
				errorCount: r.errors.length,
			})),
		});
	} catch (error: any) {
		console.error('Retry auth failed posts error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
