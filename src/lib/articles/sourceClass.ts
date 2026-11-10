import type { ResearchPackageSource } from './types';

export const SOURCE_CLASSES = [
	'expert_guidance',
	'primary_evidence',
	'educational',
	'community',
	'audience_pain_point',
	'competitor',
	'brand_knowledge',
	'internal_content',
	'background',
] as const;

export type SourceClass = (typeof SOURCE_CLASSES)[number];

/** How a finding may be stated in the article. Community reports are never presented as expert advice. */
export type EvidenceLevel = 'reported_experience' | 'expert_recommendation' | 'verified' | 'brand' | 'background';

export const SOURCE_CLASS_LABELS: Record<SourceClass, string> = {
	expert_guidance: 'Expert guidance',
	primary_evidence: 'Primary evidence',
	educational: 'Educational resource',
	community: 'Community discussion',
	audience_pain_point: 'Audience pain point',
	competitor: 'Competitor intelligence',
	brand_knowledge: 'Brand knowledge',
	internal_content: 'Internal content',
	background: 'General background',
};

const COMMUNITY = /(^|\.)(reddit\.com|quora\.com|stackexchange\.com|news\.ycombinator\.com|discord\.com|facebook\.com|x\.com|twitter\.com|threads\.net|goodreads\.com\/topic|absolutewrite\.com|nanowrimo\.org\/forums)$/;
const VIDEO = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/;
const PRIMARY = /(\.gov|\.gov\.[a-z]{2}|\.ac\.[a-z]{2}|\.edu)$|(^|\.)(doi\.org|ncbi\.nlm\.nih\.gov|jstor\.org|arxiv\.org|census\.gov|pewresearch\.org)$/;
const EDUCATIONAL = /(^|\.)(masterclass\.com|wikipedia\.org|britannica\.com|coursera\.org|khanacademy\.org|purdue\.edu|grammarly\.com)$/;
const PUBLISHER = /(^|\.)(theguardian\.com|nytimes\.com|newyorker\.com|theatlantic\.com|bbc\.co\.uk|bbc\.com|publishersweekly\.com|businessinsider\.com|forbes\.com)$/;

export type SourceContext = { brandDomain?: string | null; competitorDomains?: string[]; internalDomains?: string[] };

function host(domain: string): string {
	return domain.toLowerCase().replace(/^www\./, '');
}

/** Classifies by provenance only. The classification describes where a source comes from, not whether it is correct. */
export function classifySource(source: Pick<ResearchPackageSource, 'domain' | 'url' | 'title' | 'origin'>, context: SourceContext = {}): SourceClass {
	const domain = host(source.domain || (() => {
		try {
			return new URL(source.url).hostname;
		} catch {
			return '';
		}
	})());
	const brand = context.brandDomain ? host(context.brandDomain) : null;
	if (brand && (domain === brand || domain.endsWith(`.${brand}`))) {
		return /\/(articles|blog|guides|resources|tools)\//.test(source.url) ? 'internal_content' : 'brand_knowledge';
	}
	if ((context.internalDomains ?? []).some((item) => domain.endsWith(host(item)))) return 'internal_content';
	if ((context.competitorDomains ?? []).some((item) => domain.endsWith(host(item)))) return 'competitor';
	if (COMMUNITY.test(domain)) {
		return /\b(struggl|stuck|can'?t|cannot|help|advice needed|frustrat|anxious|afraid|overwhelm)/i.test(source.title) ? 'audience_pain_point' : 'community';
	}
	if (PRIMARY.test(domain)) return 'primary_evidence';
	if (EDUCATIONAL.test(domain)) return 'educational';
	if (VIDEO.test(domain)) return 'educational';
	if (PUBLISHER.test(domain)) return 'background';
	return 'expert_guidance';
}

export function evidenceLevel(sourceClass: SourceClass | undefined): EvidenceLevel {
	switch (sourceClass) {
		case 'community':
		case 'audience_pain_point':
			return 'reported_experience';
		case 'primary_evidence':
			return 'verified';
		case 'brand_knowledge':
		case 'internal_content':
			return 'brand';
		case 'background':
		case 'competitor':
			return 'background';
		default:
			return 'expert_recommendation';
	}
}

/** Wording the writer must use for each evidence level. */
export function attributionRule(level: EvidenceLevel): string {
	switch (level) {
		case 'reported_experience':
			return 'Present as what some writers report experiencing. Never as advice, fact or consensus.';
		case 'verified':
			return 'May be stated as a fact with a link to the source.';
		case 'brand':
			return 'Brand or internal material. Use for product facts and internal links only.';
		case 'background':
			return 'Context only. Do not build an argument on it.';
		default:
			return 'Attribute as one practitioner’s recommendation, not as established fact.';
	}
}

/** Adds classifications to sources stored before classification existed. Existing values are kept. */
export function withSourceClasses<T extends Pick<ResearchPackageSource, 'domain' | 'url' | 'title' | 'origin'> & { classification?: SourceClass }>(
	sources: T[],
	context: SourceContext,
): T[] {
	return sources.map((source) => (source.classification ? source : { ...source, classification: classifySource(source, context) }));
}
