import { CAPS, type PlanId } from '@/config/pricing';

export function enforceCaps(params: {
	plan: PlanId;
	mtdPostCount: number; // month-to-date scheduled + published
}): { ok: true } | { ok: false; code: 402; message: string } {
	const caps = CAPS[params.plan];
	const limit = caps.postsPerMonth === 'unlimited' ? Number.POSITIVE_INFINITY : caps.postsPerMonth;
	if (params.mtdPostCount >= limit) {
		return { ok: false, code: 402, message: 'Post limit reached. Upgrade to publish more.' };
	}
	return { ok: true };
}


