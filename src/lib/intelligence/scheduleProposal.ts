import { DateTime } from 'luxon';
import type { BrandBrain, BrandStrategy, ContentMemoryRecord, PerformanceSnapshot } from './types';
import { confidenceFromSample } from './performance';
import { timezoneFromBrandBrain } from './brandTimezone';

export type ScheduleProposalKind = 'performance_window' | 'cadence_slot' | 'experimental_test';

export type ScheduleProposal = {
	publishAtIso: string;
	humanLabel: string;
	kind: ScheduleProposalKind;
	note: string;
	sufficientHistory: boolean;
	sampleSize: number;
};

function gstSuffix(timezone: string): string {
	return timezone === 'Asia/Dubai' ? ' GST' : '';
}

function formatHumanLabel(iso: string, timezone: string): string {
	const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
	if (!dt.isValid) return iso;
	return `${dt.toFormat('ccc d LLL, h:mm a')}${gstSuffix(timezone)}`;
}

function parsePostsPerWeek(cadence?: string): number {
	if (!cadence) return 2;
	const lower = cadence.toLowerCase();
	const daily = lower.match(/(\d+)\s*(?:x|\/)?\s*day/);
	if (daily) return Math.min(7, Math.max(1, Number(daily[1]) * 7));
	const weekly = lower.match(/(\d+)\s*(?:x|\/)?\s*week/);
	if (weekly) return Math.max(1, Number(weekly[1]));
	const perWeek = lower.match(/(\d+)\s*(?:posts?\s*)?(?:per|\/)\s*week/);
	if (perWeek) return Math.max(1, Number(perWeek[1]));
	const range = lower.match(/(\d+)\s*-\s*(\d+)\s*\/?\s*week/);
	if (range) return Math.max(1, Math.round((Number(range[1]) + Number(range[2])) / 2));
	return 2;
}

function hourScoresFromSnapshots(
	snapshots: PerformanceSnapshot[],
	channel: string,
	timezone: string,
): Map<number, { sum: number; n: number }> {
	const byHour = new Map<number, { sum: number; n: number }>();
	for (const row of snapshots) {
		if (row.channel !== channel) continue;
		const collected = row.collectedAt ? DateTime.fromISO(row.collectedAt, { zone: 'utc' }) : null;
		if (!collected?.isValid) continue;
		const local = collected.setZone(timezone);
		const hour = local.hour;
		const score = row.engagementRate ?? 0;
		const bucket = byHour.get(hour) ?? { sum: 0, n: 0 };
		bucket.sum += score;
		bucket.n += 1;
		byHour.set(hour, bucket);
	}
	return byHour;
}

function nextCadenceSlot(input: {
	now: DateTime;
	postsPerWeek: number;
	preferredHour: number;
}): DateTime {
	const spacingDays = Math.max(1, Math.round(7 / input.postsPerWeek));
	let candidate = input.now.plus({ days: 1 }).set({ hour: input.preferredHour, minute: 0, second: 0, millisecond: 0 });
	while (candidate <= input.now) {
		candidate = candidate.plus({ days: spacingDays });
	}
	return candidate;
}

export function buildScheduleProposal(input: {
	brain: BrandBrain;
	strategy: BrandStrategy | null;
	channel: string;
	snapshots: PerformanceSnapshot[];
	scheduledMemories?: ContentMemoryRecord[];
	now?: Date;
}): ScheduleProposal {
	const timezone = timezoneFromBrandBrain(input.brain);
	const nowUtc = input.now ?? new Date();
	const now = DateTime.fromJSDate(nowUtc, { zone: 'utc' }).setZone(timezone);
	const channel = input.channel.toLowerCase();
	const channelStrategy = input.strategy?.channelStrategies.find((row) => row.channel === channel);
	const postsPerWeek = parsePostsPerWeek(channelStrategy?.cadence);

	const relevantSnapshots = input.snapshots.filter((row) => row.channel === channel);
	const sampleSize = relevantSnapshots.length;
	const confidence = confidenceFromSample(sampleSize);
	const sufficientHistory = confidence !== 'insufficient' && sampleSize >= 8;

	const hourBuckets = hourScoresFromSnapshots(relevantSnapshots, channel, timezone);
	let preferredHour = 19;
	let kind: ScheduleProposalKind = 'experimental_test';
	let note =
		sampleSize < 8
			? 'Experimental test slot. Not enough published posts to infer a best time.'
			: 'Cadence-based slot. Performance history is still too thin to rank clock times.';

	if (sufficientHistory) {
		const ranked = [...hourBuckets.entries()]
			.map(([hour, stats]) => ({ hour, avg: stats.sum / stats.n, n: stats.n }))
			.filter((row) => row.n >= 2)
			.sort((a, b) => b.avg - a.avg);
		if (ranked.length >= 2) {
			preferredHour = ranked[0].hour;
			kind = 'performance_window';
			note = `Observational window from ${sampleSize} posts on ${channel}. Not a guarantee of reach or engagement.`;
		}
	} else if (sampleSize >= 3) {
		kind = 'cadence_slot';
		note = `Cadence slot from strategy (${channelStrategy?.cadence ?? 'default spacing'}). Limited performance history (${sampleSize} posts).`;
	}

	let slot = nextCadenceSlot({ now, postsPerWeek, preferredHour });

	const occupied = new Set(
		(input.scheduledMemories ?? [])
			.filter((row) => row.channel === channel && row.publicationDate)
			.map((row) => {
				const dt = DateTime.fromISO(String(row.publicationDate), { zone: 'utc' }).setZone(timezone);
				return dt.isValid ? dt.toFormat('yyyy-MM-dd-HH') : '';
			})
			.filter(Boolean),
	);

	for (let attempt = 0; attempt < 14; attempt += 1) {
		const key = slot.toFormat('yyyy-MM-dd-HH');
		if (!occupied.has(key)) break;
		slot = slot.plus({ days: 1 });
	}

	const publishAtIso = slot.toUTC().toISO() ?? slot.toISO() ?? now.toISO()!;

	return {
		publishAtIso,
		humanLabel: formatHumanLabel(publishAtIso, timezone),
		kind,
		note,
		sufficientHistory,
		sampleSize,
	};
}

export function proposedScheduleLabelFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
	if (!metadata) return null;
	const label = metadata.proposedScheduleLabel;
	if (typeof label === 'string' && label.trim()) return label.trim();
	const legacy = metadata.proposedSchedule;
	if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
	return null;
}
