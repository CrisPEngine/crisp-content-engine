import type { BrandBrain } from '@/lib/intelligence/types';
import type { ImageQualityFinding } from '@/lib/media/imageQuality';
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
	model?: string | null;
	provider?: string | null;
	qualityFindings?: ImageQualityFinding[];
};

export type ImageCandidate = {
	assetId: string;
	url: string;
	prompt: string;
	concept: string;
	createdAt: string;
	estimatedCostUsd: number | null;
	selected: boolean;
	accepted?: boolean;
	rejected?: boolean;
	model?: string | null;
	provider?: string | null;
	qualityFindings?: ImageQualityFinding[];
	altText?: string;
	altStatus?: AltTextStatus;
};

export type AltTextStatus = 'pending' | 'generated' | 'needs_review' | 'failed' | 'manual';

export type ImageCreativeBrief = {
	purpose: ArticleImageRole;
	suggestedConcept: string;
	concept: string;
	prompt: string;
	/** Locked when the user edits the technical prompt directly. */
	promptManuallyEdited?: boolean;
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
	qualityFindings?: ImageQualityFinding[];
	altStatus?: AltTextStatus;
	effectivePrompt?: string;
	provider?: string | null;
	model?: string | null;
};

export type MediaCreativeState = {
	hero: ImageCreativeBrief;
	og: ImageCreativeBrief;
};

const HERO_RATIO = '16:9';
const OG_RATIO = '1.91:1';
const CONCEPT_MIN_WORDS = 30;
const CONCEPT_MAX_WORDS = 80;

export function emptyImageBrief(role: ArticleImageRole): ImageCreativeBrief {
	return {
		purpose: role,
		suggestedConcept: '',
		concept: '',
		prompt: '',
		promptManuallyEdited: false,
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
		qualityFindings: [],
		altStatus: undefined,
		effectivePrompt: '',
		provider: null,
		model: null,
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

/** Truncate only on sentence or word boundaries — never mid-word mid-sentence silence. */
export function summariseCoherently(text: string, maxChars: number): string {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	if (!trimmed) return '';
	if (trimmed.length <= maxChars) return trimmed;
	const slice = trimmed.slice(0, maxChars);
	const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('.”'), slice.lastIndexOf('."'));
	if (sentenceEnd >= Math.floor(maxChars * 0.45)) {
		return slice.slice(0, sentenceEnd + 1).replace(/[“"]?$/, '').trim();
	}
	const wordEnd = slice.lastIndexOf(' ');
	if (wordEnd >= Math.floor(maxChars * 0.5)) return `${slice.slice(0, wordEnd).trim()}…`;
	return `${slice.trim()}…`;
}

function clampConceptWords(concept: string): string {
	const words = concept.trim().split(/\s+/).filter(Boolean);
	if (words.length <= CONCEPT_MAX_WORDS) return words.join(' ');
	return summariseCoherently(words.join(' '), CONCEPT_MAX_WORDS * 7);
}

/** Deterministic visual concept — describes a scene, does not paste article prose. */
export function suggestImageConcept(input: {
	role: ArticleImageRole;
	title: string;
	topic: string;
	excerpt?: string;
	audience?: string;
	imageRequirements?: string;
	brandName?: string;
	hasProductScreenshot?: boolean;
}): string {
	const topic = `${input.title} ${input.topic}`.toLowerCase();
	const audience = input.audience?.trim() || 'the reader';
	const writing = /writ|book|novel|manuscript|author|draft|outline|premise/.test(topic);
	const productCue = input.hasProductScreenshot
		? ' Include a laptop or device that displays the genuine product interface from the selected screenshot—do not invent UI chrome.'
		: ' Keep any screens blank or out of focus unless a verified product screenshot is attached.';

	let scene: string;
	if (input.role === 'og') {
		scene = writing
			? `Tight ${OG_RATIO} social crop of a first-time writer starting a book in a contemporary café: one clear subject, open notebook or laptop edge, natural light, restrained editorial mood.${productCue}`
			: `Tight ${OG_RATIO} social crop with one clear subject that expresses “${summariseCoherently(input.title || input.topic, 60)}”, readable at thumbnail size, restrained editorial styling.`;
	} else if (writing) {
		scene = `A first-time writer beginning a book in a contemporary café, morning light across a small table, focused posture, and a sense of a creative project taking shape for ${audience}.${productCue} Composition: ${HERO_RATIO} editorial photograph, shallow depth, no stock handshake, no generic empty desk montage.`;
	} else {
		const intent = summariseCoherently(input.excerpt || input.topic || input.title, 90);
		scene = `An editorial ${HERO_RATIO} photograph whose main subject and setting make “${summariseCoherently(input.title || input.topic, 70)}” concrete for ${audience}. Mood: specific and physical rather than symbolic. Composition centres one action.${intent ? ` Intent cue (do not paint as text): ${intent}.` : ''}${productCue}`;
	}

	if (input.imageRequirements?.trim() && !/^\s*(none|no images?)\s*$/i.test(input.imageRequirements)) {
		scene += ` Honour role needs: ${summariseCoherently(input.imageRequirements, 80)}.`;
	}
	return clampConceptWords(scene);
}

export function buildArticleImagePrompt(input: {
	role: ArticleImageRole;
	brand?: Pick<BrandBrain, 'identity' | 'voice' | 'knowledge'> | null;
	topic: string;
	concept: string;
	negativeConstraints?: string;
	revisionInstructions?: string;
	brandStyleNotes?: string;
	hasProductReference?: boolean;
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
		negativeConstraints: input.negativeConstraints,
		revisionInstructions: input.revisionInstructions,
		brandStyleOverride: styleNotes || undefined,
		roleFraming:
			input.role === 'og'
				? 'Compose for social sharing: subject must remain clear when cropped to a small card. Prefer fewer elements and stronger silhouette than a wide editorial hero.'
				: 'Compose for an article hero: atmosphere and place matter; keep product UI legible if a reference screenshot is provided.',
		hasProductReference: input.hasProductReference,
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
			return `This concept is similar to a recent brand image (“${summariseCoherently(prior, 80)}”). You can still generate it if intentional brand consistency is desired.`;
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
		qualityFindings: patch.qualityFindings ?? base.qualityFindings,
	};
}

export function wordCount(value: string): number {
	return value.trim().split(/\s+/).filter(Boolean).length;
}

export function isVisuallyActionableConcept(concept: string): boolean {
	const words = wordCount(concept);
	if (words < CONCEPT_MIN_WORDS || words > CONCEPT_MAX_WORDS + 15) return false;
	if (/you need enough of a choice|before you write page one/i.test(concept)) return false;
	return /(subject|setting|light|composition|mood|café|cafe|workspace|photograph|scene|writer|laptop)/i.test(concept);
}
