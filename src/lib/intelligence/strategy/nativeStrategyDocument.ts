import type { BrandBrain, BrandStrategy, ContentTheme } from '../types';
import type { NativeStrategyDraft } from './nativeStrategySchema';
import { nativeStrategyExtrasSchema } from './nativeStrategySchema';
import type { z } from 'zod';

type StrategyExtras = z.infer<typeof nativeStrategyExtrasSchema>;

/** Build a Make-compatible strategy document for Airtable strategy_json and summary rendering. */
export function nativeStrategyDocumentFromDraft(
	brain: BrandBrain,
	strategy: BrandStrategy,
	draft: NativeStrategyDraft,
	themes: ContentTheme[] = [],
): Record<string, unknown> {
	const extras = (strategy.strategyExtras ?? draft.extras ?? {}) as StrategyExtras;
	const richPillars = extras.richPillars?.length
		? extras.richPillars
		: draft.contentPillars.map((title) => ({ title, why: '', exampleHooks: [] as string[] }));

	const pillars = richPillars.map((pillar) => {
		const formats = 'contentFormats' in pillar && pillar.contentFormats ? pillar.contentFormats : [];
		const hooks = 'exampleHooks' in pillar && pillar.exampleHooks ? pillar.exampleHooks : [];
		return {
			name: pillar.title,
			why: pillar.why ?? '',
			content_formats: formats,
			example_hooks: hooks,
		};
	});

	const cadence =
		extras.cadenceByPlatform ??
		Object.fromEntries(
			(draft.channelStrategies.length ? draft.channelStrategies : strategy.channelStrategies).map((row) => [
				row.channel,
				row.cadence ?? '',
			]),
		);

	const postMix = extras.postMix;
	const post_mix = postMix
		? {
				thought_leadership_pct: postMix.thoughtLeadershipPct,
				educational_pct: postMix.educationalPct,
				promo_pct: postMix.promoPct,
				community_pct: postMix.communityPct,
			}
		: {};

	return {
		source: 'native',
		brand_name: brain.identity.name,
		brand_summary: {
			one_liner: draft.positioning ?? strategy.positioning ?? brain.identity.positioning ?? '',
			positioning: draft.positioning ?? strategy.positioning ?? '',
		},
		brand_understanding: {
			summary: brain.identity.description ?? brain.identity.purpose ?? '',
			perceived_audience: draft.audiences.map((a) => a.name).join(', '),
			tone_description: brain.voice.tone ?? extras.voice?.summary ?? '',
		},
		objectives: draft.objectives,
		audiences: draft.audiences,
		audience_problems: draft.audienceProblems,
		desired_outcomes: draft.desiredOutcomes,
		positioning: draft.positioning ?? '',
		key_messages: draft.keyMessages,
		proof_points: draft.proofPoints.filter((p) => !p.flagged).map((p) => p.text),
		pillars,
		content_pillars: draft.contentPillars,
		cadence,
		platform_cadence: draft.channelStrategies.map((ch) => ({
			platform: ch.channel,
			cadence: ch.cadence,
			role: ch.role,
		})),
		post_mix,
		voice: extras.voice ?? { summary: brain.voice.tone ?? '' },
		hashtag_buckets: extras.hashtagBuckets ?? {},
		schedule_windows: extras.scheduleWindows ?? {},
		kpis: extras.kpis
			? {
					primary: extras.kpis.primary,
					secondary: extras.kpis.secondary,
					objective_alignment: extras.kpis.objectiveAlignment,
				}
			: {},
		guardrails: {
			phrases_to_avoid: brain.guardrails.phrasesToAvoid ?? [],
			required_terminology: brain.guardrails.requiredTerminology ?? [],
		},
		automation: extras.automationFlags ?? {},
		image_direction: extras.imageDirection ?? {},
		themes: themes.map((theme) => ({ name: theme.title, status: theme.status, objective: theme.objective })),
		campaigns: draft.campaigns,
		cta_strategy: draft.ctaStrategy,
		content_mix: draft.contentMix,
		editorial_themes: draft.editorialThemes,
		generation_engine: 'native',
	};
}
