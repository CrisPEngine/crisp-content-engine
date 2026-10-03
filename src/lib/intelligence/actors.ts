import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import type { IntelligenceActionName } from './actions';

export type IntelligenceChannel = 'web' | 'telegram' | 'mcp' | 'cron';

export type IntelligenceActor = {
	type: IntelligenceChannel;
	actorId: string;
	userId: string;
	scopes: string[];
};

export class IntelligenceAuthError extends Error {
	status: number;
	code: string;
	constructor(message: string, status = 401, code = 'intelligence_unauthorized') {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export const TELEGRAM_ACTIONS: IntelligenceActionName[] = [
	'get_brand',
	'get_strategy',
	'get_theme',
	'list_themes',
	'list_pending_content',
	'get_performance',
	'get_experiments',
	'generate_ideas',
	'create_brief',
	'draft_content',
	'approve_content',
	'reject_content',
	'schedule_content',
	'validate_brand',
	'compare_performance',
	'ingest_performance',
	'execute_theme_plan',
	'create_theme',
	'generate_theme_plan',
];

const GENERATE_ACTIONS = new Set<string>([
	'draft_content',
	'create_brief',
	'execute_theme_plan',
	'generate_theme_plan',
	'generate_ideas',
]);

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return result === 0;
}

function mapTelegramUser(telegramUserId: string): string | null {
	const raw = process.env.TELEGRAM_USER_MAP || '';
	for (const part of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
		const [telegramId, userId] = part.split(':').map((item) => item.trim());
		if (telegramId === telegramUserId) return userId;
	}
	return null;
}

export async function resolveIntelligenceActor(request: Request): Promise<IntelligenceActor> {
	const channel = (request.headers.get('x-cce-channel') || 'web').toLowerCase() as IntelligenceChannel;
	const secretHeader = request.headers.get('x-cce-secret') || request.headers.get('x-intelligence-secret');

	if (channel === 'telegram') {
		const expected = process.env.TELEGRAM_BOT_SECRET || process.env.INTELLIGENCE_BOT_SECRET;
		if (!expected || !secretHeader || !safeEqual(secretHeader, expected)) {
			throw new IntelligenceAuthError('Telegram secret is invalid', 401, 'telegram_secret_invalid');
		}
		const telegramUser = request.headers.get('x-telegram-user-id') || '';
		const mapped = mapTelegramUser(telegramUser);
		const headerUser = request.headers.get('x-cce-user-id');
		const mapConfigured = Boolean(process.env.TELEGRAM_USER_MAP?.trim());
		if (mapConfigured) {
			if (!mapped) {
				throw new IntelligenceAuthError('Telegram user is not mapped to a CCE user', 403, 'telegram_user_unmapped');
			}
			if (headerUser && headerUser !== mapped) {
				throw new IntelligenceAuthError('Telegram user map mismatch', 403, 'telegram_user_mismatch');
			}
			return { type: 'telegram', actorId: telegramUser || mapped, userId: mapped, scopes: ['telegram'] };
		}
		if (!headerUser) {
			throw new IntelligenceAuthError('Telegram user is not mapped to a CCE user', 403, 'telegram_user_unmapped');
		}
		return { type: 'telegram', actorId: telegramUser || headerUser, userId: headerUser, scopes: ['telegram'] };
	}

	if (channel === 'mcp') {
		const expected = process.env.INTELLIGENCE_MCP_SECRET || process.env.OPERATOR_API_SECRET;
		if (!expected || !secretHeader || !safeEqual(secretHeader, expected)) {
			throw new IntelligenceAuthError('MCP secret is invalid', 401, 'mcp_secret_invalid');
		}
		const userId = request.headers.get('x-cce-user-id');
		if (!userId) {
			throw new IntelligenceAuthError('MCP calls must include x-cce-user-id', 400, 'mcp_user_required');
		}
		return { type: 'mcp', actorId: 'mcp', userId, scopes: ['mcp'] };
	}

	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		throw new IntelligenceAuthError('Unauthorized', 401, 'session_required');
	}
	return { type: 'web', actorId: user.id, userId: user.id, scopes: ['session'] };
}

export function assertActionAllowed(actor: IntelligenceActor, action: IntelligenceActionName): void {
	if (actor.type === 'telegram' && !TELEGRAM_ACTIONS.includes(action)) {
		throw new IntelligenceAuthError(`Telegram cannot run ${action}`, 403, 'telegram_action_forbidden');
	}
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const idempotency = new Map<string, { hash: string; body: unknown; expiresAt: number }>();

export function resetIntelligenceActorStateForTests(): void {
	rateBuckets.clear();
	idempotency.clear();
}

export function enforceIntelligenceRateLimit(actor: IntelligenceActor, action: string): void {
	const generate = GENERATE_ACTIONS.has(action);
	const limit = generate ? (actor.type === 'telegram' ? 6 : 20) : actor.type === 'telegram' ? 40 : 120;
	const windowMs = generate ? 10 * 60_000 : 60_000;
	const key = `${actor.type}:${actor.actorId}:${generate ? 'generate' : 'other'}`;
	const now = Date.now();
	const existing = rateBuckets.get(key);
	if (!existing || existing.resetAt <= now) {
		rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
		return;
	}
	existing.count += 1;
	if (existing.count > limit) {
		throw new IntelligenceAuthError('Rate limit exceeded', 429, 'intelligence_rate_limited');
	}
}

export function replayIdempotent(actor: IntelligenceActor, action: string, key: string | null, input: unknown): unknown | null {
	if (!key) return null;
	const record = idempotency.get(`${actor.userId}:${action}:${key}`);
	if (!record || record.expiresAt < Date.now()) return null;
	const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
	if (record.hash !== hash) {
		throw new IntelligenceAuthError('Idempotency key reused with a different payload', 409, 'idempotency_conflict');
	}
	return record.body;
}

export function storeIdempotent(actor: IntelligenceActor, action: string, key: string | null, input: unknown, body: unknown): void {
	if (!key) return;
	const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
	idempotency.set(`${actor.userId}:${action}:${key}`, {
		hash,
		body,
		expiresAt: Date.now() + 24 * 60 * 60_000,
	});
}

export function formatTelegramResult(action: string, result: unknown): { text: string } {
	const compact = JSON.stringify(result, (_key, value) => {
		if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 497)}…`;
		if (_key.toLowerCase().includes('token') || _key.toLowerCase().includes('secret') || _key.toLowerCase().includes('apikey')) {
			return undefined;
		}
		return value;
	});
	const text = `${action}\n${compact ?? ''}`.slice(0, 3500);
	return { text };
}

export async function logIntelligenceAction(entry: {
	userId: string;
	actor: IntelligenceActor;
	action: string;
	ok: boolean;
	errorCode?: string;
	brandAirtableId?: string;
	idempotencyKey?: string;
	durationMs: number;
}): Promise<void> {
	console.info('[intelligence_action]', {
		user_id: entry.userId,
		actor_type: entry.actor.type,
		actor_id: entry.actor.actorId,
		action: entry.action,
		ok: entry.ok,
		error_code: entry.errorCode,
		duration_ms: entry.durationMs,
		brand: entry.brandAirtableId,
	});
	try {
		if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
		const { getSupabaseService } = await import('@/lib/supabaseService');
		await getSupabaseService().from('intelligence_action_logs').insert({
			user_id: entry.userId,
			actor_type: entry.actor.type,
			actor_id: entry.actor.actorId,
			channel: entry.actor.type,
			action: entry.action,
			ok: entry.ok,
			error_code: entry.errorCode ?? null,
			brand_airtable_id: entry.brandAirtableId ?? null,
			idempotency_key: entry.idempotencyKey ?? null,
			duration_ms: entry.durationMs,
		});
	} catch {
		// Best-effort; console log is enough if table is not applied yet.
	}
}
