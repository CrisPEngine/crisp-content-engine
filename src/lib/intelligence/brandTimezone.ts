import type { BrandBrain } from './types';

const TIMEZONE_FACT_RE = /timezone:\s*(.+)/i;

export function timezoneFromBrandBrain(brain: BrandBrain): string {
	for (const fact of brain.knowledge.brandFacts ?? []) {
		const match = fact.match(TIMEZONE_FACT_RE);
		if (match?.[1]?.trim()) return match[1].trim();
	}
	const metaTz = brain.identity.description?.match(TIMEZONE_FACT_RE)?.[1]?.trim();
	if (metaTz) return metaTz;
	return 'UTC';
}
