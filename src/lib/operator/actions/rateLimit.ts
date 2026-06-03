import { getSupabaseService } from '@/lib/supabaseService';
import { OperatorActionError } from './errors';
import type { OperatorActor } from './logger';
import type { OperatorActionName } from './schemas';

type RateLimitPolicy = {
	limit: number;
	windowSeconds: number;
	category: 'fetch' | 'mutate' | 'generate';
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function numberFromEnv(name: string, fallback: number) {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getRateLimitPolicy(action: OperatorActionName): RateLimitPolicy {
	if (action === 'fetch_brand_content_queue' || action === 'fetch_operator_logs') {
		return {
			category: 'fetch',
			limit: numberFromEnv('OPERATOR_RATE_LIMIT_FETCH', 120),
			windowSeconds: numberFromEnv('OPERATOR_RATE_LIMIT_FETCH_WINDOW_SECONDS', 60),
		};
	}

	if (
		action === 'generate_or_refresh_brand_strategy' ||
		action === 'generate_content_batch' ||
		action === 'regenerate_individual_post'
	) {
		return {
			category: 'generate',
			limit: numberFromEnv('OPERATOR_RATE_LIMIT_GENERATE', 10),
			windowSeconds: numberFromEnv('OPERATOR_RATE_LIMIT_GENERATE_WINDOW_SECONDS', 300),
		};
	}

	return {
		category: 'mutate',
		limit: numberFromEnv('OPERATOR_RATE_LIMIT_MUTATE', 30),
		windowSeconds: numberFromEnv('OPERATOR_RATE_LIMIT_MUTATE_WINDOW_SECONDS', 60),
	};
}

function actorRateLimitKey(actor: OperatorActor, sourceIp?: string | null) {
	return [actor.type, actor.id, sourceIp || 'unknown-ip'].join(':');
}

function checkMemoryRateLimit(key: string, action: OperatorActionName, policy: RateLimitPolicy) {
	const bucketKey = `${key}:${action}`;
	const now = Date.now();
	const existing = memoryBuckets.get(bucketKey);

	if (!existing || existing.resetAt <= now) {
		const resetAt = now + policy.windowSeconds * 1000;
		memoryBuckets.set(bucketKey, { count: 1, resetAt });
		return {
			allowed: true,
			remaining: policy.limit - 1,
			resetAt,
		};
	}

	existing.count += 1;
	return {
		allowed: existing.count <= policy.limit,
		remaining: Math.max(policy.limit - existing.count, 0),
		resetAt: existing.resetAt,
	};
}

export async function enforceOperatorRateLimit(options: {
	action: OperatorActionName;
	actor: OperatorActor;
	sourceIp?: string | null;
}) {
	const policy = getRateLimitPolicy(options.action);
	const key = actorRateLimitKey(options.actor, options.sourceIp);

	try {
		const admin = getSupabaseService();
		const { data, error } = await admin.rpc('check_operator_rate_limit', {
			p_key: key,
			p_action: options.action,
			p_window_seconds: policy.windowSeconds,
			p_limit: policy.limit,
		});

		if (!error && Array.isArray(data) && data.length > 0) {
			const row = data[0] as Record<string, unknown>;
			const allowed = Boolean(row.allowed);
			if (!allowed) {
				throw new OperatorActionError('Operator rate limit exceeded', {
					status: 429,
					code: 'operator_rate_limit_exceeded',
					details: {
						action: options.action,
						category: policy.category,
						limit: policy.limit,
						windowSeconds: policy.windowSeconds,
						resetAt: row.reset_at,
					},
				});
			}
			return {
				remaining: typeof row.remaining === 'number' ? row.remaining : undefined,
				resetAt: row.reset_at,
			};
		}

		if (error) {
			console.warn('[OperatorAction] Durable rate limit failed; using memory fallback:', error.message);
		}
	} catch (error) {
		if (error instanceof OperatorActionError) throw error;
		console.warn('[OperatorAction] Durable rate limit failed; using memory fallback:', error);
	}

	const fallback = checkMemoryRateLimit(key, options.action, policy);
	if (!fallback.allowed) {
		throw new OperatorActionError('Operator rate limit exceeded', {
			status: 429,
			code: 'operator_rate_limit_exceeded',
			details: {
				action: options.action,
				category: policy.category,
				limit: policy.limit,
				windowSeconds: policy.windowSeconds,
				resetAt: new Date(fallback.resetAt).toISOString(),
				fallback: true,
			},
		});
	}

	return {
		remaining: fallback.remaining,
		resetAt: new Date(fallback.resetAt).toISOString(),
	};
}
