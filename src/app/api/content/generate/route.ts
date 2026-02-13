import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { enforceCaps, getEntitlements, getMonthUsage, getChannelUsage } from '@/lib/enforceCaps';
import { getSupabaseService } from '@/lib/supabaseService';
import { X_ALGO_DIGEST } from '@/lib/channels/x-algo-digest';
import { CAPS } from '@/config/pricing';
import type { MultiChannelMakePayload, BrandVoiceContext, MonthlyBrief, PreviousContentItem, SchedulingContext } from '@/lib/makeMultiChannelPayload';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { resolvePlan, getTrialUsage } from '@/lib/planResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Request schema for multi-channel generation
const generateSchema = z.object({
	brandProfileId: z.string().min(1),
	channels: z.array(z.object({
		platform: z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog']),
		count: z.number().int().min(1).max(50), // Max 50 per channel per request
	})).min(1),
	strategyId: z.string().optional(),
});

/**
 * Generate content for multiple channels
 * POST /api/content/generate
 * Body: { brandProfileId: string, channels: [{platform, count}], strategyId?: string }
 */
export async function POST(req: Request) {
	try {
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

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json().catch(() => ({}));
		const parseResult = generateSchema.safeParse(body);

		if (!parseResult.success) {
			return NextResponse.json(
				{ error: 'Invalid request body', details: parseResult.error.issues },
				{ status: 400 }
			);
		}

		const { brandProfileId, channels, strategyId } = parseResult.data;

		// Calculate total requested count
		const totalRequested = channels.reduce((sum, ch) => sum + ch.count, 0);

		console.log('[Content Generate] Request:', {
			brandProfileId,
			channels,
			totalRequested,
		});

		// Use canonical plan resolver (handles trial provisioning)
		const resolved = await resolvePlan(user.id);
		const plan = resolved.plan === 'free' ? 'trial' : resolved.plan; // Treat free as trial for now (legacy compat)
		
		// Email verification gate
		if (!resolved.isEmailVerified) {
			return NextResponse.json(
				{
					error: 'Please verify your email address before generating content. Check your inbox for the verification link.',
					email_verification_required: true,
				},
				{ status: 403 }
			);
		}
		
		// Trial quota enforcement
		if (resolved.isTrial && plan === 'trial') {
			const trialUsage = await getTrialUsage(user.id);
			
			if (trialUsage) {
				// Check if trial credits exhausted for requested channels
				for (const ch of channels) {
					const platformKey = ch.platform.toLowerCase();
					
					if (platformKey === 'linkedin' && trialUsage.linkedin >= 3) {
						return NextResponse.json(
							{
								error: 'You have used all 3 LinkedIn trial posts. Upgrade to Starter or Creator to continue generating content.',
								upgrade_required: true,
								channel: 'LinkedIn',
								limit: 3,
								used: trialUsage.linkedin,
							},
							{ status: 403 }
						);
					}
					
					if (platformKey === 'x' && trialUsage.x >= 3) {
						return NextResponse.json(
							{
								error: 'You have used all 3 X trial posts. Upgrade to Starter or Creator to continue generating content.',
								upgrade_required: true,
								channel: 'X',
								limit: 3,
								used: trialUsage.x,
							},
							{ status: 403 }
						);
					}
					
					// Check if request would exceed remaining trial credits
					if (platformKey === 'linkedin' && trialUsage.linkedin + ch.count > 3) {
						return NextResponse.json(
							{
								error: `This would exceed your trial limit. You have ${3 - trialUsage.linkedin} LinkedIn posts remaining. Upgrade to continue.`,
								upgrade_required: true,
								channel: 'LinkedIn',
								limit: 3,
								used: trialUsage.linkedin,
								remaining: 3 - trialUsage.linkedin,
								requested: ch.count,
							},
							{ status: 403 }
						);
					}
					
					if (platformKey === 'x' && trialUsage.x + ch.count > 3) {
						return NextResponse.json(
							{
								error: `This would exceed your trial limit. You have ${3 - trialUsage.x} X posts remaining. Upgrade to continue.`,
								upgrade_required: true,
								channel: 'X',
								limit: 3,
								used: trialUsage.x,
								remaining: 3 - trialUsage.x,
								requested: ch.count,
							},
							{ status: 403 }
						);
					}
				}
			}
		}
		
		// Rate limiting (trial users only)
		if (resolved.isTrial && plan === 'trial') {
			const admin = getSupabaseService();
			const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
			
			const { data: recentJobs, error: rateLimitError } = await admin
				.from('generation_jobs')
				.select('generation_job_id')
				.eq('user_id', user.id)
				.gte('created_at', sixtySecondsAgo);
			
			if (!rateLimitError && recentJobs && recentJobs.length >= 2) {
				return NextResponse.json(
					{
						error: 'Please wait a moment before generating more content. Rate limit: 2 requests per minute.',
						rate_limit_exceeded: true,
					},
					{ status: 429 }
				);
			}
		}

		// Get entitlements and current usage
		const entitlements = await getEntitlements(user.id);
		const postsUsed = await getMonthUsage(user.id);
		const planCaps = CAPS[plan as keyof typeof CAPS] || CAPS.trial;
		const maxPostsPerMonth = entitlements?.posts_per_month || planCaps.postsPerMonth;
		const postsRemaining = typeof maxPostsPerMonth === 'number' ? maxPostsPerMonth - postsUsed : 999999;

		// Pre-check quota
		if (totalRequested > postsRemaining) {
			return NextResponse.json(
				{
					error: `This would exceed your monthly limit. You have ${postsRemaining} posts remaining, but requested ${totalRequested}.`,
					posts_remaining: postsRemaining,
					posts_requested: totalRequested,
				},
				{ status: 403 }
			);
		}

		// Per-channel limits for Starter/Trial plans
		if (planCaps.perChannelLimits) {
			const channelUsage = await getChannelUsage(user.id);
			
			// Check each requested channel against per-channel limits
			for (const ch of channels) {
				const platformKey = ch.platform.toLowerCase();
				const limit = planCaps.perChannelLimits[platformKey as 'linkedin' | 'x' | 'blog'];
				
				if (limit !== undefined) {
					let currentUsage = 0;
					if (platformKey === 'linkedin') currentUsage = channelUsage.linkedin;
					else if (platformKey === 'x') currentUsage = channelUsage.x;
					else if (platformKey === 'blog') currentUsage = channelUsage.blog;
					
					// Block if limit is 0 (not allowed at all)
					if (limit === 0) {
						return NextResponse.json(
							{
								error: `${ch.platform} posts are not available on your ${plan} plan. Upgrade to Creator or higher to access this channel.`,
								upgrade_required: true,
							},
							{ status: 403 }
						);
					}
					
					// Check if request would exceed per-channel limit
					if (currentUsage + ch.count > limit) {
						return NextResponse.json(
							{
								error: `This would exceed your ${ch.platform} limit. You have ${limit - currentUsage} ${ch.platform} posts remaining this month (${currentUsage}/${limit} used).`,
								channel: ch.platform,
								limit,
								used: currentUsage,
								remaining: limit - currentUsage,
								requested: ch.count,
							},
							{ status: 403 }
						);
					}
				}
			}
		}

		// Filter channels by plan (check includedPlatforms)
		// planCaps already defined above for per-channel limits check
		const allowedPlatforms = planCaps.includedPlatforms.map((p) => {
			if (p === 'linkedin') return 'LinkedIn';
			if (p === 'x') return 'X';
			if (p === 'instagram') return 'Instagram';
			if (p === 'facebook') return 'Facebook';
			if (p === 'blog') return 'Blog';
			return p;
		});

		const filteredChannels = channels.filter((ch) => allowedPlatforms.includes(ch.platform));

		if (filteredChannels.length === 0) {
			return NextResponse.json(
				{ error: 'None of the requested channels are available on your plan. Upgrade to access more channels.' },
				{ status: 403 }
			);
		}

		if (filteredChannels.length < channels.length) {
			console.warn('[Content Generate] Some channels filtered by plan:', {
				requested: channels.map((ch) => ch.platform),
				allowed: filteredChannels.map((ch) => ch.platform),
				plan,
			});
		}

		// Verify user owns this brand profile
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Fetch brand profile to verify ownership and get strategy data
		const brandUrl = `https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`;
		const brandRes = await fetch(brandUrl, {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!brandRes.ok) {
			return NextResponse.json(
				{ error: 'Brand profile not found' },
				{ status: 404 }
			);
		}

		const brandData = await brandRes.json();
		const brandFields = brandData.fields || {};

		// Verify ownership
		if (brandFields.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized: You do not own this brand profile' },
				{ status: 403 }
			);
		}

		// Get strategy data (use strategyId if provided, otherwise use the brand's approved strategy)
		// Note: Airtable stores strategy as 'strategy_json', but some older records may have 'strategy_payload'
		let strategyJson = null;
		let strategySummary = brandFields.strategy_summary || '';
		let brandType = brandFields.brand_type || 'company';

		if (strategyId) {
			// Fetch specific strategy if provided
			const STRATEGY_TABLE = process.env.AIRTABLE_STRATEGY_TABLE;
			if (STRATEGY_TABLE) {
				try {
					const strategyUrl = `https://api.airtable.com/v0/${BASE_ID}/${STRATEGY_TABLE}/${strategyId}`;
					const strategyRes = await fetch(strategyUrl, {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});
					if (strategyRes.ok) {
						const strategyData = await strategyRes.json();
						// Check both field names for compatibility
						strategyJson = strategyData.fields?.strategy_json || strategyData.fields?.strategy_payload;
						strategySummary = strategyData.fields?.strategy_summary || strategySummary;
					}
				} catch (error) {
					console.warn('Failed to fetch strategy, using brand profile strategy:', error);
				}
			}
		}

		// Use brand's strategy if no strategyId provided
		// Check both 'strategy_json' (current field name) and 'strategy_payload' (legacy field name)
		if (!strategyJson) {
			strategyJson = brandFields.strategy_json || brandFields.strategy_payload;
		}

		if (!strategyJson) {
			return NextResponse.json(
				{ error: 'No strategy found for this brand. Please approve a strategy first.' },
				{ status: 400 }
			);
		}

		// Generate idempotency keys
		const generation_job_id = randomUUID();
		const request_id = generation_job_id; // Can be same or different

		// Pre-generate content_item_key values for each item
		const channelsWithKeys = filteredChannels.map((ch) => {
			const keys: string[] = [];
			for (let i = 1; i <= ch.count; i++) {
				keys.push(`${generation_job_id}:${ch.platform}:${i}`);
			}
			return {
				platform: ch.platform,
				count: ch.count,
				keys,
			};
		});

		// Multi-channel flow uses dedicated webhook (Creator flow unchanged)
		const webhookUrl = process.env.MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL;

		if (!webhookUrl) {
			return NextResponse.json(
				{ error: 'Multi-channel content generation webhook not configured (MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL)' },
				{ status: 500 }
			);
		}

		// Parse strategy_json if it's a string
		let parsedStrategyJson = strategyJson;
		if (typeof strategyJson === 'string') {
			try {
				parsedStrategyJson = JSON.parse(strategyJson);
			} catch (e) {
				console.warn('Failed to parse strategy_json, using as-is:', e);
			}
		}

		// Create generation job in Supabase (for idempotency tracking and progress)
		const admin = getSupabaseService();
		await admin.from('generation_jobs').insert({
			generation_job_id,
			user_id: user.id,
			brand_profile_id: brandProfileId,
			channels: JSON.stringify(channelsWithKeys),
			requested_count: totalRequested,
			expected_platforms: channelsWithKeys.map((ch) => ch.platform),
			completed_platforms: [],
			status: 'in_progress',
			created_counts: {},
			record_ids: {},
		});

		console.log('[Content Generate] Created generation job:', {
			generation_job_id,
			requested_count: totalRequested,
		});

		// --- Brand voice context (all known BrandProfiles fields, null/empty when missing) ---
		const brandVoiceContext: BrandVoiceContext = {
			client_name: brandFields.client_name ?? null,
			brand_type: brandType ?? null,
			timezone: brandFields.timezone ?? 'UTC',
			website: brandFields.website ?? null,
			audience: brandFields.audience ?? null,
			value_props: brandFields.value_props ?? null,
			offers: brandFields.offers ?? null,
			brand_tone: brandFields.brand_tone ?? null,
			brand_keywords: brandFields.brand_keywords ?? null,
			exclude_keywords: brandFields.exclude_keywords ?? null,
			content_rules: brandFields.content_rules ?? null,
			voice_rules: brandFields.voice_rules ?? null,
			compliance_notes: brandFields.compliance_notes ?? null,
			language_region: brandFields.language_region ?? 'US English',
			spelling_variant: brandFields.spelling_variant ?? null,
			posting_windows: brandFields.posting_windows ?? null,
			platforms_requested: Array.isArray(brandFields.platforms_requested) ? brandFields.platforms_requested : null,
			risk_tolerance: brandFields.risk_tolerance ?? brandFields.personal_risk_tolerance ?? null,
			tone_avoid: Array.isArray(brandFields.personal_tone_avoid) ? brandFields.personal_tone_avoid : (Array.isArray(brandFields.tone_avoid) ? brandFields.tone_avoid : null),
			personal_voice_traits: Array.isArray(brandFields.personal_voice_traits) ? brandFields.personal_voice_traits : null,
			personal_content_style: Array.isArray(brandFields.personal_content_style) ? brandFields.personal_content_style : null,
			brand_goals: brandFields.brand_goals ?? null,
			additional_info: brandFields.additional_info ?? null,
			preferred_image_source: brandFields.preferred_image_source ?? null,
		};
		if (brandType === 'personal') {
			brandVoiceContext.personal_full_name = brandFields.personal_full_name ?? null;
			brandVoiceContext.personal_job_title = brandFields.personal_job_title ?? null;
			brandVoiceContext.personal_industry = brandFields.personal_industry ?? null;
			brandVoiceContext.personal_links = brandFields.personal_links ?? null;
			brandVoiceContext.personal_headline = brandFields.personal_headline ?? null;
			brandVoiceContext.personal_audience = brandFields.personal_audience ?? null;
			brandVoiceContext.personal_expertise = brandFields.personal_expertise ?? null;
			brandVoiceContext.personal_goals = brandFields.personal_goals ?? null;
			brandVoiceContext.personal_story = brandFields.personal_story ?? null;
		}

		// --- Monthly brief (latest for this brand, or null) ---
		let monthly_brief: MonthlyBrief | null = null;
		const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
		const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		if (CONTENTBRIEFS_TABLE && AIRTABLE_TOKEN && BASE_ID) {
			try {
				const briefsUrl = `https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}?filterByFormula=${encodeURIComponent(`FIND("${brandProfileId}", {brand_profile_id})`)}&sort[0][field]=created_time&sort[0][direction]=desc&maxRecords=1`;
				const briefsRes = await fetch(briefsUrl, {
					headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
				});
				if (briefsRes.ok) {
					const briefsData = await briefsRes.json();
					const briefRecord = briefsData.records?.[0];
					if (briefRecord?.fields) {
						const f = briefRecord.fields as Record<string, unknown>;
						const bestId = Array.isArray(f.best_performing_post_id) ? (f.best_performing_post_id[0] as string) : (f.best_performing_post_id as string);
						const worstId = Array.isArray(f.worst_performing_post_id) ? (f.worst_performing_post_id[0] as string) : (f.worst_performing_post_id as string);
						let best_post: MonthlyBrief['best_post'] = null;
						let worst_post: MonthlyBrief['worst_post'] = null;
						if (CONTENTQUEUE_TABLE && (bestId || worstId)) {
							if (bestId) {
								const bestRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}/${bestId}`, {
									headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
								});
								if (bestRes.ok) {
									const bestData = await bestRes.json();
									const bf = (bestData.fields || {}) as Record<string, unknown>;
									best_post = {
										title: (bf.hook as string) || (bf.post_title as string) || '',
										body_draft: (bf.post_content as string) || (bf.post_body as string) || '',
										reason: (f.best_post_reason as string) || '',
									};
								}
							}
							if (worstId) {
								const worstRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}/${worstId}`, {
									headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
								});
								if (worstRes.ok) {
									const worstData = await worstRes.json();
									const wf = (worstData.fields || {}) as Record<string, unknown>;
									worst_post = {
										title: (wf.hook as string) || (wf.post_title as string) || '',
										body_draft: (wf.post_content as string) || (wf.post_body as string) || '',
										reason: (f.worst_post_reason as string) || '',
									};
								}
							}
						}
						monthly_brief = {
							objective: (f.objective as string) ?? null,
							themes_focus: (f.themes_focus as string) ?? null,
							key_dates: (f.key_dates as string) ?? null,
							feedback_notes: (f.feedback_notes as string) ?? null,
							content_preferences: (f.content_preferences as string) ?? null,
							primary_goal: (f.primary_goal as string) ?? null,
							success_metric: (f.success_metric as string) ?? null,
							cycle_label: (f.cycle_label as string) ?? null,
							cycle_start_date: (f.cycle_start_date as string) ?? null,
							cta: (f.cta as string) ?? null,
							cta_link: (f.cta_link as string) ?? null,
							offers_to_push: (f.offers_to_push as string) ?? null,
							topics_to_avoid_this_month: (f.topics_to_avoid_this_month as string) ?? null,
							competitor_or_inspo_links: (f.competitor_or_inspo_links as string) ?? null,
							best_post,
							worst_post,
						};
					}
				}
			} catch (e) {
				console.warn('[Content Generate] Monthly brief fetch failed, sending null:', e);
			}
		}

		// --- Previous content (dedupe snapshot: last 30–60 items, compact) ---
		let previous_content_json: PreviousContentItem[] = [];
		if (CONTENTQUEUE_TABLE && AIRTABLE_TOKEN && BASE_ID) {
			try {
				const queueUrl = `https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}?filterByFormula=${encodeURIComponent(`FIND("${brandProfileId}", {brand_profile_id})`)}&sort[0][field]=created_time&sort[0][direction]=desc&maxRecords=60&fields[]=platform&fields[]=hook&fields[]=post_type&fields[]=created_time&fields[]=topic_bucket&fields[]=one_line_summary`;
				const queueRes = await fetch(queueUrl, {
					headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
				});
				if (queueRes.ok) {
					const queueData = await queueRes.json();
					previous_content_json = (queueData.records || []).map((r: { id: string; fields: Record<string, unknown>; createdTime?: string }) => {
						const f = r.fields || {};
						return {
							platform: (f.platform as string) || '',
							hook: (f.hook as string) || '',
							post_type: f.post_type as string | undefined,
							topic_bucket: (f.topic_bucket as string) ?? null,
							created_time: (f.created_time as string) || r.createdTime || '',
							one_line_summary: (f.one_line_summary as string) ?? null,
						};
					});
				}
			} catch (e) {
				console.warn('[Content Generate] Previous content fetch failed, sending empty array:', e);
			}
		}

		// --- Scheduling context (do not ask OpenAI to schedule) ---
		const tz = brandVoiceContext.timezone || 'UTC';
		const now = new Date();
		const cadenceFromStrategy = parsedStrategyJson && typeof parsedStrategyJson === 'object'
			? (parsedStrategyJson as { platform_cadence?: Array<{ platform?: string; postsPerWeek?: number }>; cadence?: Array<{ platform?: string; postsPerWeek?: number }> }).platform_cadence
				|| (parsedStrategyJson as { cadence?: Array<{ platform?: string; postsPerWeek?: number }> }).cadence
			: undefined;
		const cadence_defaults: SchedulingContext['cadence_defaults'] = {};
		if (Array.isArray(cadenceFromStrategy)) {
			for (const entry of cadenceFromStrategy) {
				const platform = entry?.platform as string | undefined;
				const num = entry?.postsPerWeek ?? (entry as { postsPerWeek?: number }).postsPerWeek;
				if (platform && typeof num === 'number') {
					if (platform.toLowerCase() === 'linkedin') cadence_defaults.LinkedIn = num;
					else if (platform.toLowerCase() === 'x' || platform === 'Twitter') cadence_defaults.X = num;
					else if (platform.toLowerCase() === 'instagram') cadence_defaults.Instagram = num;
					else if (platform.toLowerCase() === 'facebook') cadence_defaults.Facebook = num;
					else if (platform.toLowerCase() === 'blog') cadence_defaults.Blog = num;
				}
			}
		}
		const scheduling_context: SchedulingContext = {
			timezone: tz,
			posting_windows: brandVoiceContext.posting_windows ?? null,
			...(Object.keys(cadence_defaults).length > 0 ? { cadence_defaults } : {}),
			now_iso: now.toISOString(),
		};

		// --- Assemble multi-channel payload for Make ---
		const makePayload: MultiChannelMakePayload = {
			generation_job_id,
			request_id,
			user_id: user.id,
			brand_profile_id: brandProfileId,
			channels: channelsWithKeys,
			brand_voice_context: brandVoiceContext,
			strategy_json: parsedStrategyJson as Record<string, unknown> | null,
			strategy_summary: strategySummary || null,
			monthly_brief,
			previous_content_json,
			scheduling_context,
			x_algo_digest: {
				version: X_ALGO_DIGEST.version,
				bullets: X_ALGO_DIGEST.bullets,
				guardrails: X_ALGO_DIGEST.guardrails,
			},
			triggered_at: new Date().toISOString(),
		};

		console.log('[Content Generate] Sending multi-channel webhook:', {
			generation_job_id,
			channels: channelsWithKeys.map((ch) => ({ platform: ch.platform, count: ch.count })),
			total_keys: channelsWithKeys.reduce((sum, ch) => sum + ch.keys.length, 0),
		});

		// Call Make webhook (fire-and-forget)
		const webhookRes = await fetch(webhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(process.env.MAKE_API_KEY && {
					'x-make-apikey': process.env.MAKE_API_KEY,
				}),
			},
			body: JSON.stringify(makePayload),
		});

		if (!webhookRes.ok) {
			const errorText = await webhookRes.text();
			console.error('[Content Generate] Make webhook failed:', {
				status: webhookRes.status,
				statusText: webhookRes.statusText,
				error: errorText,
				generation_job_id,
			});
			
			// Mark job as failed
			await admin
				.from('generation_jobs')
				.update({ completed_at: new Date().toISOString() })
				.eq('generation_job_id', generation_job_id);
			
			return NextResponse.json(
				{ error: `Content generation failed: ${errorText}` },
				{ status: 502 }
			);
		}

		console.log('[Content Generate] Make webhook accepted:', {
			generation_job_id,
			status: webhookRes.status,
		});

		return NextResponse.json({
			ok: true,
			generation_job_id,
			message: `Generating ${totalRequested} posts across ${filteredChannels.length} channels. New content will appear in your approval queue shortly.`,
			channels: channelsWithKeys.map((ch) => ({ platform: ch.platform, count: ch.count })),
		});
	} catch (error: any) {
		console.error('Content generation error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to generate content' },
			{ status: 500 }
		);
	}
}

