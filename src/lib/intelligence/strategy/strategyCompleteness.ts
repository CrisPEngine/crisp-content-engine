import type { BrandStrategy } from '../types';
import { safeParseNativeStrategyDraft } from './nativeStrategySchema';

export type StrategyCompletenessResult = {
	score: number;
	complete: boolean;
	isSkeleton: boolean;
	reasons: string[];
	phase: 'missing' | 'generating' | 'draft_ready' | 'failed' | 'active' | 'skeleton';
};

function isPlatformPillar(pillar: string): boolean {
	const normalized = pillar.trim().toLowerCase();
	return / content$/.test(normalized) && normalized.split(/\s+/).length <= 3;
}

export function strategyGenerationPhase(strategy: BrandStrategy | null | undefined): StrategyCompletenessResult['phase'] {
	if (!strategy) return 'missing';
	const meta = strategy.generationMetadata;
	const phase = meta?.phase;
	if (phase === 'generating') return 'generating';
	if (phase === 'failed') return 'failed';
	if (phase === 'ready' && strategy.draftPayload) return 'draft_ready';
	if (strategy.status === 'active') return 'active';
	if (strategy.draftPayload) return 'draft_ready';
	return 'skeleton';
}

export function scoreStrategyCompleteness(strategy: BrandStrategy | null | undefined): StrategyCompletenessResult {
	if (!strategy) {
		return { score: 0, complete: false, isSkeleton: true, reasons: ['No native strategy record'], phase: 'missing' };
	}

	const phase = strategyGenerationPhase(strategy);
	const reasons: string[] = [];
	let score = 0;

	const parsedDraft = strategy.draftPayload ? safeParseNativeStrategyDraft(strategy.draftPayload) : null;
	const draft = parsedDraft && parsedDraft.ok ? parsedDraft.data : null;
	const pillars = draft?.contentPillars?.length ? draft.contentPillars : strategy.contentPillars;
	const audiences = draft?.audiences?.length ? draft.audiences : strategy.audiences;
	const audienceProblems = draft?.audienceProblems?.length ? draft.audienceProblems : strategy.audienceProblems;
	const themes = draft?.editorialThemes?.length ? draft.editorialThemes : strategy.editorialThemes;
	const channelStrategies = draft?.channelStrategies?.length ? draft.channelStrategies : strategy.channelStrategies;

	if (pillars.length >= 3 && pillars.some((p) => !isPlatformPillar(`${p}`))) {
		score += 25;
	} else {
		reasons.push('Need at least three substantive content pillars (not platform placeholders)');
	}

	if (audiences.length > 0 && audiences.some((a) => (a.description?.trim()?.length ?? 0) > 10 || a.name.trim().length > 2)) {
		score += 20;
	} else {
		reasons.push('Audiences need names and descriptions');
	}

	if (audienceProblems.length >= 2) {
		score += 15;
	} else {
		reasons.push('Audience problems are thin or missing');
	}

	if (themes.length >= 2) {
		score += 15;
	} else {
		reasons.push('Editorial themes missing or too few');
	}

	if (channelStrategies.length >= 1 && channelStrategies.some((row) => Boolean(row.cadence?.trim()))) {
		score += 15;
	} else {
		reasons.push('Channel cadence not defined');
	}

	if ((strategy.positioning?.trim()?.length ?? 0) > 20 || (draft?.positioning?.trim()?.length ?? 0) > 20) {
		score += 10;
	} else {
		reasons.push('Positioning is missing or too short');
	}

	const skeleton =
		phase === 'skeleton' ||
		(pillars.length > 0 && pillars.every((p) => isPlatformPillar(`${p}`))) ||
		(audienceProblems.length === 0 && themes.length === 0);

	const activeComplete = strategy.status === 'active' && score >= 70 && !skeleton;
	const draftComplete = Boolean(strategy.draftPayload) && score >= 70 && !skeleton && phase === 'draft_ready';

	return {
		score,
		complete: activeComplete || draftComplete,
		isSkeleton: skeleton,
		reasons,
		phase,
	};
}

export function assertStrategyReadyForContent(strategy: BrandStrategy | null | undefined): {
	ok: true;
} | {
	ok: false;
	code: 'strategy_missing' | 'strategy_generating' | 'strategy_failed' | 'strategy_incomplete' | 'strategy_not_active';
	message: string;
	completeness: StrategyCompletenessResult;
} {
	const completeness = scoreStrategyCompleteness(strategy);
	if (!strategy) {
		return {
			ok: false,
			code: 'strategy_missing',
			message: 'No native strategy found. Generate your strategy in Intelligence first.',
			completeness,
		};
	}
	if (completeness.phase === 'generating') {
		return {
			ok: false,
			code: 'strategy_generating',
			message: 'Strategy generation is still running. Open Intelligence to watch progress, then try again.',
			completeness,
		};
	}
	if (completeness.phase === 'failed') {
		return {
			ok: false,
			code: 'strategy_failed',
			message: strategy.generationMetadata?.error ?? 'Strategy generation failed. Retry from Intelligence.',
			completeness,
		};
	}
	if (strategy.status !== 'active') {
		return {
			ok: false,
			code: 'strategy_not_active',
			message: 'Activate and approve your native strategy in Intelligence before generating content.',
			completeness,
		};
	}
	if (!completeness.complete || completeness.isSkeleton) {
		return {
			ok: false,
			code: 'strategy_incomplete',
			message: `Strategy is not complete yet: ${completeness.reasons.slice(0, 2).join('; ')}`,
			completeness,
		};
	}
	return { ok: true };
}
