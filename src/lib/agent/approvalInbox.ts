import type { ApprovalRequest } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isApprovalPendingAndActive(request: ApprovalRequest, nowMs = Date.now()): boolean {
	if (request.status !== 'PENDING') return false;
	return Date.parse(request.expiresAt) > nowMs;
}

export function approvalSortKey(request: ApprovalRequest): number {
	const publishAt = request.parameters.publishAt;
	if (typeof publishAt === 'string' && publishAt) {
		const t = Date.parse(publishAt);
		if (!Number.isNaN(t)) return t;
	}
	return Date.parse(request.createdAt) || 0;
}

export function sortPendingApprovals(requests: ApprovalRequest[]): ApprovalRequest[] {
	const now = Date.now();
	return requests
		.filter((r) => isApprovalPendingAndActive(r, now))
		.sort((a, b) => {
			const diff = approvalSortKey(a) - approvalSortKey(b);
			if (diff !== 0) return diff;
			return Date.parse(a.createdAt) - Date.parse(b.createdAt);
		});
}

export function nextPendingApproval(
	requests: ApprovalRequest[],
	excludeRequestId?: string,
): ApprovalRequest | null {
	const sorted = sortPendingApprovals(requests);
	const next = sorted.find((r) => r.id !== excludeRequestId) ?? null;
	return next;
}

export function pendingApprovalCounts(requests: ApprovalRequest[], excludeRequestId?: string) {
	const sorted = sortPendingApprovals(requests);
	const others = excludeRequestId ? sorted.filter((r) => r.id !== excludeRequestId) : sorted;
	return {
		totalPending: sorted.length,
		othersWaiting: others.length,
		next: others[0] ?? null,
	};
}

export function formatApprovalInboxMeta(request: ApprovalRequest): {
	channel: string;
	publishAt: string | null;
	expiresInHours: number;
} {
	const preview = request.preview;
	const publishAt =
		(typeof request.parameters.publishAt === 'string' && request.parameters.publishAt) ||
		(typeof preview.publishAt === 'string' ? preview.publishAt : null);
	const expiresMs = Date.parse(request.expiresAt) - Date.now();
	return {
		channel: String(preview.channel ?? request.targetType),
		publishAt,
		expiresInHours: Math.max(0, Math.round(expiresMs / DAY_MS)),
	};
}
