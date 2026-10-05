import type { BrandStrategy, ContentTheme } from './types';

/** Shape native strategy into the fields the master strategy screen already renders. */
export function nativeStrategyDocument(strategy: BrandStrategy, themes: ContentTheme[] = []) {
	return {
		source: 'native',
		brand_summary: { one_liner: strategy.positioning || strategy.objectives[0] || '' },
		objectives: strategy.objectives,
		audience: strategy.audiences.map((audience) => audience.name).join(', '),
		audiences: strategy.audiences,
		positioning: strategy.positioning ?? '',
		key_messages: strategy.keyMessages,
		value_props: strategy.keyMessages.join('\n'),
		pillars: (strategy.contentPillars.length ? strategy.contentPillars : themes.map((theme) => theme.title)).map((title) => ({ name: title })),
		content_pillars: strategy.contentPillars,
		platform_cadence: strategy.channelStrategies.map((channel) => ({
			platform: channel.channel,
			cadence: channel.cadence,
			role: channel.role,
		})),
		cta: strategy.ctaStrategy,
		campaigns: strategy.campaigns.map((campaign) => campaign.title),
		themes: themes.map((theme) => ({ name: theme.title, status: theme.status, objective: theme.objective })),
	};
}
