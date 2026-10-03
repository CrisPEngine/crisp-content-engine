import type { ContentMemoryRecord, GenerationIntent } from './types';

const STOPWORDS = new Set([
	'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'about', 'into', 'have', 'will',
]);

export function tokenize(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function overlapScore(a: string | undefined, b: string | undefined): number {
	const left = new Set(tokenize(a));
	const right = new Set(tokenize(b));
	if (left.size === 0 || right.size === 0) return 0;
	let hits = 0;
	for (const token of left) {
		if (right.has(token)) hits += 1;
	}
	return hits / Math.max(left.size, right.size);
}

export type MemoryRetrieval = {
	related: ContentMemoryRecord[];
	recentSameChannel: ContentMemoryRecord[];
	warnings: string[];
	continuationAllowed: boolean;
};

const RECENT_WINDOW = 12;
const MAX_RELATED = 6;

export function retrieveRelevantMemory(
	records: ContentMemoryRecord[],
	intent: Pick<GenerationIntent, 'channel' | 'userIntent' | 'themeId' | 'allowThemeContinuation'> & {
		topic?: string;
		hook?: string;
		argument?: string;
		cta?: string;
	},
): MemoryRetrieval {
	const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const recentSameChannel = sorted.filter((row) => row.channel === intent.channel).slice(0, RECENT_WINDOW);

	const scored = sorted
		.map((row) => {
			const topicScore = overlapScore(intent.topic || intent.userIntent, `${row.topic ?? ''} ${row.angle ?? ''} ${row.argument ?? ''}`);
			const hookScore = overlapScore(intent.hook || intent.userIntent, row.hook);
			const argumentScore = overlapScore(intent.argument || intent.userIntent, row.argument);
			const themeBoost = intent.themeId && row.themeId === intent.themeId ? 0.15 : 0;
			const recencyBoost = sorted.indexOf(row) < 8 ? 0.1 : 0;
			const agePenalty = sorted.indexOf(row) > 20 ? -0.25 : 0;
			return {
				row,
				score: topicScore * 0.45 + hookScore * 0.2 + argumentScore * 0.2 + themeBoost + recencyBoost + agePenalty,
			};
		})
		.filter((entry) => entry.score >= 0.12)
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_RELATED)
		.map((entry) => entry.row);

	const warnings: string[] = [];
	for (const row of recentSameChannel.slice(0, 5)) {
		if (overlapScore(intent.hook, row.hook) > 0.55) {
			warnings.push(`Recent hook collision with ${row.id}: "${row.hook}"`);
		}
		if (overlapScore(intent.argument, row.argument) > 0.6) {
			warnings.push(`Recent argument collision with ${row.id}`);
		}
		if (intent.cta && row.cta && overlapScore(intent.cta, row.cta) > 0.7) {
			warnings.push(`CTA "${row.cta}" was used recently`);
		}
		if (overlapScore(intent.topic, row.topic) > 0.7 && row.themeId !== intent.themeId) {
			warnings.push(`Topic "${row.topic}" covered recently without an explicit theme continuation`);
		}
	}

	const founderOveruse =
		recentSameChannel.filter((row) => /founder|origin story|when i (started|founded)/i.test(`${row.hook} ${row.body}`))
			.length >= 3;
	if (founderOveruse) {
		warnings.push('Founder-story density is high in recent posts; prefer a different proof point unless continuing a theme.');
	}

	return {
		related: scored,
		recentSameChannel,
		warnings,
		continuationAllowed: Boolean(intent.allowThemeContinuation && intent.themeId),
	};
}

export function looksNearDuplicate(candidateBody: string, existing: ContentMemoryRecord[]): boolean {
	return existing.some((row) => overlapScore(candidateBody, row.body) > 0.72);
}
