import 'server-only';

import type { BrandContext } from '../types';

export function buildCtaOffersSection(brandContext: BrandContext): string | null {
	const offers = fieldString(brandContext, 'offers');
	const cta = fieldString(brandContext, 'cta') || fieldString(brandContext, 'cta_text');
	const ctaLink = fieldString(brandContext, 'cta_link') || fieldString(brandContext, 'cta_url');

	if (!offers && !cta && !ctaLink) return null;

	const lines = [
		'--- Offers & CTA context (use sparingly) ---',
		'Promotional balance: at most ~30% of items in this batch may include a soft CTA or offer reference.',
		'Majority must remain value-driven. Never force offers into every post.',
	];
	if (offers) lines.push(`Offers: ${offers}`);
	if (cta) lines.push(`CTA guidance: ${cta}`);
	if (ctaLink) lines.push(`CTA link (use only when natural): ${ctaLink}`);
	return lines.join('\n');
}

function fieldString(ctx: BrandContext, key: string): string {
	const v = ctx[key];
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v.trim();
	if (Array.isArray(v)) return v.map(String).join(', ');
	return String(v).trim();
}
