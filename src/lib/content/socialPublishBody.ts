import { CHANNELS } from '@/lib/channels/registry';
import type { ChannelId } from '@/lib/channels/types';

const PRODUCTION_SECTION_NAMES = [
	'VISUAL CONCEPT',
	'IMAGE PROMPT',
	'CAROUSEL COPY',
	'CAPTION',
	'PRODUCTION NOTES',
	'PRODUCTION NOTE',
	'CREATIVE BRIEF',
	'ON-IMAGE COPY',
] as const;

type ProductionSectionName = (typeof PRODUCTION_SECTION_NAMES)[number];

export type ParsedSocialProductionDraft = {
	publishableBody: string;
	visualBrief: string | null;
	carouselCopy: string | null;
	hadProductionSections: boolean;
};

const SECTION_HEADER =
	/^(?:#{1,3}\s*)?(VISUAL CONCEPT|IMAGE PROMPT|CAROUSEL COPY|CAPTION|PRODUCTION NOTES?|CREATIVE BRIEF|ON-?IMAGE COPY)\s*:?\s*$/i;

function normalizeSectionName(line: string): ProductionSectionName | null {
	const cleaned = line.replace(/^#{1,3}\s*/, '').replace(/:\s*$/, '').trim().toUpperCase();
	if (cleaned === 'PRODUCTION NOTE') return 'PRODUCTION NOTES';
	if (cleaned === 'ON IMAGE COPY' || cleaned === 'ON-IMAGE COPY') return 'ON-IMAGE COPY';
	return PRODUCTION_SECTION_NAMES.find((name) => name === cleaned) ?? null;
}

export function parseSocialProductionDraft(raw: string): ParsedSocialProductionDraft {
	const text = raw.replace(/\r\n/g, '\n').trim();
	if (!text) {
		return { publishableBody: '', visualBrief: null, carouselCopy: null, hadProductionSections: false };
	}

	const lines = text.split('\n');
	const sections: Partial<Record<ProductionSectionName, string[]>> = {};
	let current: ProductionSectionName | null = null;
	let hadProductionSections = false;
	const preamble: string[] = [];

	for (const line of lines) {
		const section = normalizeSectionName(line.trim());
		if (section) {
			hadProductionSections = true;
			current = section;
			sections[current] = sections[current] ?? [];
			continue;
		}
		if (current) {
			sections[current]?.push(line);
		} else {
			preamble.push(line);
		}
	}

	const joinSection = (name: ProductionSectionName) => (sections[name] ?? []).join('\n').trim() || null;

	const visualParts = [joinSection('VISUAL CONCEPT'), joinSection('IMAGE PROMPT'), joinSection('CREATIVE BRIEF')].filter(
		Boolean,
	) as string[];
	const visualBrief = visualParts.length ? visualParts.join('\n\n') : null;
	const carouselCopy = joinSection('CAROUSEL COPY');
	const captionSection = joinSection('CAPTION');

	let publishableBody = captionSection ?? text;
	if (hadProductionSections) {
		if (captionSection) {
			publishableBody = captionSection;
		} else {
			const stripped = lines
				.filter((line) => !SECTION_HEADER.test(line.trim()))
				.join('\n')
				.trim();
			publishableBody = stripped;
			for (const name of PRODUCTION_SECTION_NAMES) {
				const block = joinSection(name);
				if (block) {
					publishableBody = publishableBody.replace(block, '').trim();
				}
			}
		}
		if (!publishableBody.trim() && preamble.length) {
			publishableBody = preamble.join('\n').trim();
		}
	}

	return {
		publishableBody: publishableBody.trim(),
		visualBrief,
		carouselCopy,
		hadProductionSections,
	};
}

function trailingCtaPattern(cta: string): RegExp | null {
	const trimmed = cta.trim();
	if (!trimmed) return null;
	const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?:\\n\\n|\\n)?${escaped}\\s*$`, 'i');
}

export function dedupeCtaFromBody(body: string, cta: string | null | undefined): string {
	const nextBody = body.trim();
	const nextCta = (cta ?? '').trim();
	if (!nextBody || !nextCta) return nextBody;
	const pattern = trailingCtaPattern(nextCta);
	if (!pattern) return nextBody;
	return nextBody.replace(pattern, '').trim();
}

export function truncateToChannelLimit(body: string, channel: string): { body: string; truncated: boolean } {
	const channelId = String(channel).toLowerCase() as ChannelId;
	const max = CHANNELS[channelId]?.constraints.maxCharsPerPost;
	if (!max || body.length <= max) return { body, truncated: false };
	return { body: body.slice(0, max).trimEnd(), truncated: true };
}

export function isSocialPublishChannel(channel: string): boolean {
	const id = String(channel).toLowerCase();
	return id === 'instagram' || id === 'facebook' || id === 'threads' || id === 'linkedin' || id === 'x';
}

export function sanitizeSocialPublishFields(input: {
	channel: string;
	body: string;
	cta?: string | null;
	metadata?: Record<string, unknown>;
}): {
	body: string;
	cta?: string;
	metadata: Record<string, unknown>;
	warnings: string[];
} {
	const metadata = { ...(input.metadata ?? {}) };
	const warnings: string[] = [];

	if (!isSocialPublishChannel(input.channel)) {
		return { body: input.body.trim(), cta: input.cta?.trim() || undefined, metadata, warnings };
	}

	const parsed = parseSocialProductionDraft(input.body);
	let body = parsed.publishableBody;
	let cta = input.cta?.trim() || undefined;

	if (parsed.hadProductionSections) {
		warnings.push('Removed internal production sections from publishable body.');
		if (parsed.visualBrief) {
			const existing = typeof metadata.image_prompt === 'string' ? metadata.image_prompt.trim() : '';
			if (!existing) {
				metadata.image_prompt = parsed.visualBrief;
			} else if (!existing.includes(parsed.visualBrief.slice(0, 80))) {
				metadata.image_prompt = `${existing}\n\n${parsed.visualBrief}`.trim();
			}
		}
		if (parsed.carouselCopy) {
			const existingBrief =
				typeof metadata.visual_brief === 'string' ? metadata.visual_brief.trim() : '';
			metadata.visual_brief = existingBrief
				? `${existingBrief}\n\n${parsed.carouselCopy}`.trim()
				: parsed.carouselCopy;
		}
	}

	body = dedupeCtaFromBody(body, cta);
	const truncated = truncateToChannelLimit(body, input.channel);
	if (truncated.truncated) {
		warnings.push(`Body exceeded channel limit and was truncated to ${truncated.body.length} characters.`);
		body = truncated.body;
	}

	return { body, cta, metadata, warnings };
}

export function composeAgentPublishText(memory: Pick<{ body?: string | null; cta?: string | null }, 'body' | 'cta'>): string {
	const body = dedupeCtaFromBody((memory.body ?? '').trim(), memory.cta);
	return body;
}
