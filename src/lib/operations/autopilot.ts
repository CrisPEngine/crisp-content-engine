const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type AutopilotMode = 'assisted' | 'autonomous_approval' | 'autonomous_publishing';

export type EditorialCandidate = {
	id: string;
	score: number;
	approved: boolean;
	topicKey: string;
	overlapping: boolean;
};

export function weekdayInTimezone(now: Date, timeZone: string): number {
	const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
	const index = WEEKDAYS.indexOf(label as (typeof WEEKDAYS)[number]);
	return index >= 0 ? index : now.getUTCDay();
}

export function publishingWindowOpen(input: { publishingDays?: number[]; publishingTimezone?: string; now?: Date }): boolean {
	const days = (input.publishingDays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
	if (!days.length) return true;
	const now = input.now ?? new Date();
	const zone = input.publishingTimezone?.trim() || 'UTC';
	return days.includes(weekdayInTimezone(now, zone));
}

export function autopilotLabel(input: { paused: boolean; mode: AutopilotMode; autonomousPublishingEnabled: boolean }): string {
	if (input.paused) return 'Paused';
	if (input.mode === 'assisted') return 'Assisted';
	if (input.mode === 'autonomous_publishing' && input.autonomousPublishingEnabled) return 'Full Autopilot';
	return 'Supervised Autopilot';
}

export function autopilotMayPublish(input: {
	paused: boolean;
	mode: AutopilotMode;
	autonomousPublishingEnabled: boolean;
	approved: boolean;
	policyAllows: boolean;
	publishingDays?: number[];
	publishingTimezone?: string;
	now?: Date;
}): { allow: boolean; reason: string } {
	if (input.paused) return { allow: false, reason: 'The campaign is paused. Nothing was published.' };
	if (input.mode !== 'autonomous_publishing' || !input.autonomousPublishingEnabled) {
		return { allow: false, reason: 'Autonomous publishing is not enabled for this brand. The article was not published.' };
	}
	if (!input.approved) return { allow: false, reason: 'Human publication approval is required. The article was not published.' };
	if (!input.policyAllows) return { allow: false, reason: 'The article has not passed the publication checks. It was not published.' };
	if (!publishingWindowOpen(input)) return { allow: false, reason: 'Today is not a configured publishing day. The article was not published.' };
	return { allow: true, reason: 'The article passed the configured checks and the publishing window is open.' };
}

export function planEditorialSelection(input: {
	target: number;
	minimumScore: number;
	candidates: EditorialCandidate[];
	takenTopicKeys: string[];
}): { selected: string[]; skipped: Array<{ id: string; reason: string }>; unfilledReason: string | null } {
	const target = Math.max(0, Math.floor(input.target));
	const taken = new Set(input.takenTopicKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
	const skipped: Array<{ id: string; reason: string }> = [];
	const selected: string[] = [];
	const ranked = [...input.candidates].sort((left, right) => Number(right.approved) - Number(left.approved) || right.score - left.score);
	for (const candidate of ranked) {
		if (selected.length >= target) break;
		const key = candidate.topicKey.trim().toLowerCase();
		if (!candidate.approved) {
			skipped.push({ id: candidate.id, reason: 'It is not an approved opportunity.' });
			continue;
		}
		if (candidate.overlapping || (key && taken.has(key))) {
			skipped.push({ id: candidate.id, reason: 'It overlaps an existing or scheduled topic.' });
			continue;
		}
		if (candidate.score < input.minimumScore) {
			skipped.push({ id: candidate.id, reason: 'It is below the quality threshold.' });
			continue;
		}
		selected.push(candidate.id);
		if (key) taken.add(key);
	}
	const unfilledReason = selected.length < target
		? 'No further approved opportunity met the quality threshold. Nothing was created to fill the weekly target.'
		: null;
	return { selected, skipped, unfilledReason };
}
