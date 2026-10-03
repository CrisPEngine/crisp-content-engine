import type { ConfidenceLevel, ContentLearning, OptimizationObjective, PerformanceSnapshot } from './types';

export function deriveRates(snapshot: Pick<PerformanceSnapshot, 'impressions' | 'clicks' | 'reactions' | 'comments' | 'shares' | 'saves'>): {
	engagementRate?: number;
	clickThroughRate?: number;
} {
	const impressions = snapshot.impressions ?? 0;
	if (impressions <= 0) return {};
	const engaged =
		(snapshot.reactions ?? 0) + (snapshot.comments ?? 0) + (snapshot.shares ?? 0) + (snapshot.saves ?? 0);
	return {
		engagementRate: engaged / impressions,
		clickThroughRate: (snapshot.clicks ?? 0) / impressions,
	};
}

export function objectiveScore(
	snapshot: PerformanceSnapshot,
	objective: OptimizationObjective,
): { score: number | null; note: string } {
	const rates = {
		...deriveRates(snapshot),
		engagementRate: snapshot.engagementRate ?? deriveRates(snapshot).engagementRate,
		clickThroughRate: snapshot.clickThroughRate ?? deriveRates(snapshot).clickThroughRate,
	};

	switch (objective) {
		case 'website_traffic':
		case 'lead_generation':
		case 'conversion':
			return rates.clickThroughRate == null
				? { score: null, note: 'Missing click data for this objective.' }
				: { score: rates.clickThroughRate, note: 'Optimising for clicks/traffic, not impressions.' };
		case 'engagement':
		case 'community':
			return { score: snapshot.comments ?? rates.engagementRate ?? null, note: 'Optimising for conversation, not reach.' };
		case 'awareness':
		case 'launch_awareness':
			return { score: snapshot.reach ?? snapshot.impressions ?? null, note: 'Reach is relevant only because the objective is awareness.' };
		default:
			return { score: rates.engagementRate ?? null, note: 'Use the campaign objective before ranking posts.' };
	}
}

export function decayLearning(learning: ContentLearning, now = new Date()): ContentLearning {
	if (!learning.lastValidatedAt && !learning.expiresAt) {
		const created = new Date(learning.createdAt).getTime();
		const ageDays = (now.getTime() - created) / 86_400_000;
		if (ageDays > 180) return { ...learning, validityStatus: 'retest_candidate' };
		if (ageDays > 90) return { ...learning, validityStatus: 'decaying' };
		return learning;
	}
	if (learning.expiresAt && new Date(learning.expiresAt) < now) {
		return { ...learning, validityStatus: 'retest_candidate' };
	}
	return learning;
}

export function applyDecay(learnings: ContentLearning[], now = new Date()): ContentLearning[] {
	return learnings.map((learning) => decayLearning(learning, now));
}

export type PerformanceQuestion =
	| 'hooks'
	| 'themes'
	| 'ctas'
	| 'topics'
	| 'formats'
	| 'times'
	| 'founder_vs_company';

export function confidenceFromSample(n: number): ConfidenceLevel {
	if (n < 5) return 'insufficient';
	if (n < 12) return 'low';
	if (n < 25) return 'moderate';
	return 'high';
}

export function summariseGroup(
	label: string,
	snapshots: PerformanceSnapshot[],
	objective: OptimizationObjective,
): { label: string; n: number; mean: number | null; confidence: ConfidenceLevel; note: string } {
	const scored = snapshots.map((snapshot) => objectiveScore(snapshot, objective).score).filter((value): value is number => value != null);
	const mean = scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
	return {
		label,
		n: snapshots.length,
		mean,
		confidence: confidenceFromSample(snapshots.length),
		note:
			snapshots.length < 5
				? 'Too few observations to rank this group.'
				: 'Observational only. Not a causal claim.',
	};
}
