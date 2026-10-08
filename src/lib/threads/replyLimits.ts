import { isPlatformSuperAdmin } from '@/lib/auth/platformAdmin';
import { getAgentStore } from '@/lib/agent/controlStore';
import type { CommunityInteraction } from '@/lib/agent/types';
import { AgentError } from '@/lib/agent/errors';

const DAY_MS = 24 * 60 * 60 * 1000;

export function threadsRepliesDailyCap(isAdmin: boolean): number {
	if (isAdmin) {
		const raw = process.env.THREADS_REPLIES_ADMIN_DAILY_CAP;
		const parsed = raw ? Number.parseInt(raw, 10) : 100;
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
	}
	const raw = process.env.THREADS_REPLIES_DAILY_CAP;
	const parsed = raw ? Number.parseInt(raw, 10) : 30;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function replyTargetKey(interaction: Pick<CommunityInteraction, 'resolvedMediaId' | 'externalPostId' | 'targetUrl'>): string | null {
	return interaction.resolvedMediaId ?? interaction.externalPostId ?? interaction.targetUrl ?? null;
}

function isSameUtcDay(a: string, b: Date): boolean {
	const t = Date.parse(a);
	if (Number.isNaN(t)) return false;
	const d = new Date(t);
	return d.getUTCFullYear() === b.getUTCFullYear() && d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() === b.getUTCDate();
}

export function countPublishedRepliesToday(interactions: CommunityInteraction[], now = new Date()): number {
	return interactions.filter(
		(row) => row.responseStatus === 'published' && row.publishedAt && isSameUtcDay(row.publishedAt, now),
	).length;
}

export function findDuplicateReplyTarget(
	interactions: CommunityInteraction[],
	candidate: Pick<CommunityInteraction, 'id' | 'resolvedMediaId' | 'externalPostId' | 'targetUrl' | 'brandId'>,
): CommunityInteraction | null {
	const key = replyTargetKey(candidate);
	if (!key) return null;
	return (
		interactions.find((row) => {
			if (row.id === candidate.id) return false;
			if (row.brandId !== candidate.brandId) return false;
			if (row.responseStatus !== 'published' && row.responseStatus !== 'awaiting_approval') return false;
			return replyTargetKey(row) === key;
		}) ?? null
	);
}

export async function assertThreadsReplyAllowed(input: {
	ownerUserId: string;
	interaction: CommunityInteraction;
}): Promise<void> {
	const store = getAgentStore();
	const all = await store.listAllInteractions(input.ownerUserId);
	const duplicate = findDuplicateReplyTarget(all, input.interaction);
	if (duplicate) {
		throw new AgentError(
			'duplicate_threads_reply',
			'A reply to this Threads post is already drafted, awaiting approval, or published.',
			409,
		);
	}
	const isAdmin = await isPlatformSuperAdmin(input.ownerUserId);
	const cap = threadsRepliesDailyCap(isAdmin);
	const usedToday = countPublishedRepliesToday(all);
	if (usedToday >= cap) {
		throw new AgentError(
			'threads_reply_rate_limited',
			`Daily Threads reply cap reached (${cap} per UTC day). Try again tomorrow.`,
			429,
		);
	}
}

/** @internal test helper */
export function msUntilUtcDayEnd(now = new Date()): number {
	const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	return Math.max(0, end - now.getTime());
}

export { DAY_MS };
