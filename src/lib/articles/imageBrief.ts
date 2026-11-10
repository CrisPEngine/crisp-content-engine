import type { BrandBrain } from '@/lib/intelligence/types';
import { buildImagePrompt } from '@/lib/media/prompt';

export type ArticleImageRole = 'hero' | 'og';

export type ImageGenerationHistoryEntry = {
	at: string;
	prompt: string;
	concept: string;
	assetId: string | null;
	url: string | null;
	reused: boolean;
	estimatedCostUsd: number | null;
	revisionInstructions?: string | null;
};

export type ImageCandidate = {
	assetId: string;
	url: string;
	prompt: string;
	concept: string;
	createdAt: string;
	estimatedCostUsd: number | null;
	selected: boolean;
};

export type ImageCreativeBrief = {
	purpose: ArticleImageRole;
	suggestedConcept: string;
	concept: string;
	prompt: string;
	negativeConstraints: string;
	referenceAssetIds: string[];
	brandStyleNotes: string;
	dimensions: string;
	revisionInstructions: string;
	estimatedCostUsd: number | null;
	lastCostUsd: number | null;
	similarityWarning: string | null;
	history: ImageGenerationHistoryEntry[];
	candidates: ImageCandidate[];
};

export type MediaCreativeState = {
	hero: ImageCreativeBrief;
	og: ImageCreativeBrief;
};

const HERO_RATIO = '16:9';
const OG_RATIO = '1.91:1';

export function emptyImageBrief(role: ArticleImageRole): ImageCreativeBrief {
	return {
		purpose: role,
		suggestedConcept: '',
		concept: '',
		prompt: '',
		negativeConstraints: '',
		referenceAssetIds: [],
		brandStyleNotes: '',
		dimensions: role === 'og' ? OG_RATIO : HERO_RATIO,
		revisionInstructions: '',
		estimatedCostUsd: null,
		lastCostUsd: null,
		similarityWarning: null,
		history: [],
		candidates: [],
	};
}

export function emptyMediaCreativeState(): MediaCreativeState {
	return { hero: emptyImageBrief('hero'), og: emptyImageBrief('og') };
}

export function aspectRatioForRole(role: ArticleImageRole): string {
	return role === 'og' ? OG_RATIO : HERO_RATIO;
}

export function purposeLabel(role: ArticleImageRole): string {
	return role === 'og' ? 'Social share image' : 'Article hero image';
}

function brandVisualNotes(brand: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null | undefined): string {
	const notes = brand?.knowledge.referenceInformation ?? [];
	return notes.filter((note) => /visual|palette|photography|art direction|imagery|brand style/i.test(note)).join('\n');
}

/** Deterministic concept seed from article context — role-specific so hero and social diverge. */
export function suggestImageConcept(input: {
	role: ArticleImageRole;
	title: string;
	topic: string;
	excerpt?: string;
	audience?: string;
	imageRequirements?: string;
}): string {
	const subject = (input.title || input.topic || 'the article').trim();
	const scene =
		input.role === 'og'
			? `A tight ${OG_RATIO} crop that reads at thumbnail size: one clear subject for “${subject}”, without a second competing scene.`
			: `A ${HERO_RATIO} editorial photograph for “${subject}”: one specific physical moment a reader of this piece would recognise, not a generic desk montage.`;
	const audience = input.audience?.trim() ? ` Aimed at ${input.audience.trim()}.` : '';
	const req = input.imageRequirements?.trim() && !/^\s*(none|no images?)\s*$/i.test(input.imageRequirements)
		? ` Honour these image requirements: ${input.imageRequirements.trim()}.`
		: '';
	const excerpt = input.excerpt?.trim() ? ` Support this idea without painting text: ${input.excerpt.trim().slice(0, 220)}` : '';
	return `${scene}${audience}${req}${excerpt}`.trim();
}

export function buildArticleImagePrompt(input: {
	role: ArticleImageRole;
	brand?: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null;
	topic: string;
	concept: string;
	excerpt?: string;
	negativeConstraints?: string;
	revisionInstructions?: string;
	brandStyleNotes?: string;
}): { prompt: string; visualGuidanceStored: boolean; dimensions: string } {
	const dimensions = aspectRatioForRole(input.role);
	const styleNotes = input.brandStyleNotes?.trim() || brandVisualNotes(input.brand);
	const built = buildImagePrompt({
		brand: input.brand,
		channel: 'BLOG',
		topic: input.topic,
		concept: input.concept,
		aspectRatio: dimensions,
		purpose: purposeLabel(input.role),
		excerpt: input.excerpt,
		negativeConstraints: input.negativeConstraints,
		revisionInstructions: input.revisionInstructions,
		brandStyleOverride: styleNotes || undefined,
		roleFraming:
			input.role === 'og'
				? 'Compose for social sharing: subject must remain clear when cropped to a small card. Prefer fewer elements and stronger silhouette than a wide editorial hero.'
				: 'Compose for an article hero: atmosphere and place matter; keep product UI legible if a reference screenshot is provided.',
	});
	return { ...built, dimensions };
}

export function conceptSimilarityWarning(proposed: string, recentConcepts: string[]): string | null {
	const next = normaliseConcept(proposed);
	if (!next) return null;
	for (const prior of recentConcepts) {
		const previous = normaliseConcept(prior);
		if (!previous) continue;
		const score = jaccard(next, previous);
		if (score >= 0.55) {
			return `This concept is similar to a recent brand image (“${prior.slice(0, 80)}${prior.length > 80 ? '…' : ''}”). You can still generate it if intentional brand consistency is desired.`;
		}
	}
	return null;
}

function normaliseConcept(value: string): Set<string> {
	return new Set(
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length > 2),
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (!a.size || !b.size) return 0;
	let intersection = 0;
	for (const token of a) if (b.has(token)) intersection += 1;
	const union = a.size + b.size - intersection;
	return union ? intersection / union : 0;
}

export function mergeImageBrief(
	current: ImageCreativeBrief | undefined,
	patch: Partial<ImageCreativeBrief> | null | undefined,
	role: ArticleImageRole,
): ImageCreativeBrief {
	const base = current ?? emptyImageBrief(role);
	if (!patch) return base;
	return {
		...base,
		...patch,
		purpose: role,
		referenceAssetIds: patch.referenceAssetIds ?? base.referenceAssetIds,
		history: patch.history ?? base.history,
		candidates: patch.candidates ?? base.candidates,
	};
}
