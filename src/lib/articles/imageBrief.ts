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

export type ImageConceptOption = {
	id: string;
	title: string;
	description: string;
	rationale: string;
	message: string;
};

function topicText(input: { title: string; topic: string }): string {
	return `${input.title} ${input.topic}`.toLowerCase();
}

function sceneFor(kind: 'start' | 'continuity' | 'general', role: ArticleImageRole, input: { title: string; topic: string; excerpt?: string; audience?: string }, productCue: string): string[] {
	const ratio = role === 'og' ? OG_RATIO : HERO_RATIO;
	const crop = role === 'og' ? `Tight ${ratio} social crop, readable at thumbnail size.` : `Composition: ${ratio} editorial photograph, restrained mood.`;
	if (kind === 'start') {
		return [
			`A first-time writer beginning a book in a contemporary café, morning light across a small table, focused posture, and a creative project taking shape. ${crop}${productCue}`,
			`A quiet desk photograph of a blank first page, one pen, and a short list of story ideas, with natural side light and no crowded background. ${crop}`,
			`An overhead photograph of a notebook opened to a first scene, beside a closed laptop with a blank screen, showing the moment a book starts. ${crop}`,
		];
	}
	if (kind === 'continuity') {
		return [
			`Overhead editorial photograph of manuscript pages, character reference sheets and a story timeline being cross-referenced on a wooden desk. Setting is an editor’s table. ${crop} No laptop unless a product screenshot is explicitly selected.`,
			`A photographic composition of chapter notes, dated events and a manuscript arranged in story order so the chronology is visible. Soft directional light, one pair of hands comparing two pages. ${crop}`,
			`Writer’s reference materials showing character profiles, relationships and pencil annotations across manuscript pages, communicating character consistency. ${crop}`,
		];
	}
	const subject = summariseCoherently(input.title || input.topic, 70);
	const audience = input.audience?.trim() || 'the reader';
	return [
		`An editorial ${ratio} photograph whose subject and setting make “${subject}” concrete for ${audience}. Mood is specific and physical. Composition centres one action.${productCue}`,
		`A close photographic detail of the materials a practitioner would actually use for “${subject}”, with natural light and a clear foreground. ${crop}`,
		`A wider editorial scene showing the work in progress for “${subject}”, one person and one task, without a generic café or empty desk. ${crop}`,
	];
}

/** Three different visual directions. The first is the default suggestion. */
export function suggestImageConcepts(input: {
	role: ArticleImageRole;
	title: string;
	topic: string;
	excerpt?: string;
	audience?: string;
	imageRequirements?: string;
	brandName?: string;
	hasProductScreenshot?: boolean;
	verifiedCapabilityNames?: string[];
}): ImageConceptOption[] {
	const topic = topicText(input);
	const kind = /continuity|story bible|character consistency|timeline/.test(topic)
		? 'continuity'
		: /start writing|first page|first idea|begin a book|first-time/.test(topic)
			? 'start'
			: 'general';
	const productCue = [
		input.hasProductScreenshot ? 'A selected product screenshot may appear on a device. Do not invent interface text.' : '',
		input.verifiedCapabilityNames?.length ? `Verified product areas: ${input.verifiedCapabilityNames.join(', ')}.` : 'Do not depict a product screen for an unverified capability.',
	].filter(Boolean).join(' ');
	const titles = kind === 'continuity'
		? ['Editorial desk', 'Story chronology', 'Character consistency']
		: kind === 'start'
			? ['Starting the book', 'First page', 'First scene']
			: ['Subject in context', 'Working materials', 'Work in progress'];
	const messages = kind === 'continuity'
		? ['Story continuity through cross-referencing', 'Chronology can be checked', 'Characters stay consistent across pages']
		: kind === 'start'
			? ['A book is beginning', 'The first page is the task', 'A scene is chosen']
			: ['The subject is concrete', 'The work uses real materials', 'One task is underway'];
	return sceneFor(kind, input.role, input, productCue).map((description, index) => ({
		id: `${kind}-${index + 1}`,
		title: titles[index] ?? `Direction ${index + 1}`,
		description: clampConceptWords(description),
		rationale: kind === 'continuity' ? 'The image should show continuity work, not the act of starting a novel.' : 'The scene follows this article’s subject.',
		message: messages[index] ?? '',
	}));
}

export function conceptRelevanceWarning(concept: string, title: string, topic: string): string | null {
	const subject = topicText({ title, topic });
	const cafeStart = /caf[eé]|first-time writer|beginning a book/i.test(concept);
	if (cafeStart && /continuity|story bible|timeline|character consistency/.test(subject)) {
		return 'This concept shows someone beginning a novel in a café. The article is about preventing continuity errors, so the image should show manuscript cross-referencing, chronology, or character consistency.';
	}
	return null;
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
	verifiedCapabilityNames?: string[];
}): string {
	const options = suggestImageConcepts(input);
	let scene = options[0]?.description ?? '';
	if (
		input.imageRequirements?.trim() &&
		!/^\s*(none|no images?)\s*$/i.test(input.imageRequirements) &&
		!/^\s*hero image and social image\.?\s*$/i.test(input.imageRequirements.trim())
	) {
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

function textField(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

/** Fills fields that older saved briefs never stored, so render and generation can treat them as strings. */
export function normaliseImageBrief(value: Partial<ImageCreativeBrief> | null | undefined, role: ArticleImageRole): ImageCreativeBrief {
	const empty = emptyImageBrief(role);
	const source = value ?? {};
	return {
		...empty,
		...source,
		purpose: role,
		concept: textField(source.concept),
		suggestedConcept: textField(source.suggestedConcept),
		prompt: textField(source.prompt),
		negativeConstraints: textField(source.negativeConstraints),
		brandStyleNotes: textField(source.brandStyleNotes),
		revisionInstructions: textField(source.revisionInstructions),
		effectivePrompt: textField(source.effectivePrompt),
		similarityWarning: typeof source.similarityWarning === 'string' ? source.similarityWarning : null,
		referenceAssetIds: Array.isArray(source.referenceAssetIds) ? source.referenceAssetIds.filter((id): id is string => typeof id === 'string') : [],
		history: Array.isArray(source.history)
			? source.history.filter((item): item is ImageGenerationHistoryEntry => Boolean(item)).map((item) => ({
				...item,
				concept: textField(item.concept),
				prompt: textField(item.prompt),
			}))
			: [],
		candidates: Array.isArray(source.candidates) ? source.candidates : [],
		qualityFindings: Array.isArray(source.qualityFindings) ? source.qualityFindings : [],
	};
}

export function mergeImageBrief(
	current: ImageCreativeBrief | undefined,
	patch: Partial<ImageCreativeBrief> | null | undefined,
	role: ArticleImageRole,
): ImageCreativeBrief {
	const base = normaliseImageBrief(current, role);
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
