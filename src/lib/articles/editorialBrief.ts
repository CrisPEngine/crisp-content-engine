import type { ArticleBriefDetails, ResearchPackage } from './types';
import { evidenceLevel, type SourceClass } from './sourceClass';
import { capabilityGuidance, detectKnowledgeGaps, usableCapabilities, type ProductCapability } from './productKnowledge';

export type BriefBasis = 'confirmed' | 'proposed';

export type EditorialBriefSection = {
	heading: string;
	questions: string[];
	confirmedEvidence: string[];
	proposedDirection: string;
	knowledgeGaps: string[];
};

export type EditorialBriefVersion = {
	version: number;
	createdAt: string;
	status: 'draft' | 'approved' | 'needs_reapproval';
	approvedAt: string | null;
	title: string;
	alternativeTitles: string[];
	searchIntent: string;
	primaryKeyword: string;
	supportingKeywords: string[];
	questions: string[];
	audience: string;
	readerProblem: string;
	outcome: string;
	brandRelevance: string;
	conversionObjective: string;
	introduction: string;
	sections: EditorialBriefSection[];
	examples: string[];
	internalLinks: string[];
	externalCitations: Array<{ title: string; url: string; classification: string; cite: boolean }>;
	capabilities: Array<{ name: string; availability: string; verified: boolean }>;
	claimsToVerify: string[];
	cta: string;
	targetWords: number;
	differentiation: string;
	cmsRequirements: string[];
	confirmed: string[];
	proposed: string[];
	instruction: string;
};

export type EditorialBriefState = {
	current: EditorialBriefVersion | null;
	history: EditorialBriefVersion[];
};

export type EditorialBriefInput = {
	topic: string;
	title: string;
	searchIntent: string;
	primaryKeyword?: string | null;
	audience?: string | null;
	targetWords: number;
	brief?: ArticleBriefDetails;
	research?: ResearchPackage | null;
	capabilities?: ProductCapability[];
	brandName?: string | null;
	destinationLabel?: string | null;
	instruction?: string;
	now?: string;
};

function lines(value: string | undefined): string[] {
	return (value ?? '').split(/\n/).map((line) => line.trim()).filter(Boolean);
}

function headingsFromResearch(research: ResearchPackage | null | undefined, questions: string[]): string[] {
	const fromItems = (research?.items ?? []).filter((item) => !item.excluded && item.kind === 'recommendation').map((item) => item.text.trim()).slice(0, 4);
	if (fromItems.length >= 2) return fromItems.map((item) => item.replace(/^#+\s*/, '').slice(0, 90));
	if (questions.length) return questions.slice(0, 6).map((question) => question.replace(/\?$/, ''));
	return ['Define the problem', 'Show the method', 'Apply it'];
}

/** Builds a research-led brief. Confirmed lines come only from approved research or verified capabilities. */
export function buildEditorialBrief(input: EditorialBriefInput, previous: EditorialBriefVersion | null = null): EditorialBriefVersion {
	const research = input.research;
	const approved = research?.status === 'approved' || Boolean(research?.approved);
	const confirmedFindings = (approved ? research?.approved?.items ?? research?.items ?? [] : [])
		.filter((item) => item && !item.excluded && item.supported)
		.map((item) => item.text.trim())
		.filter(Boolean);
	const questions = lines(input.brief?.questions);
	const keywords = lines(input.brief?.secondaryKeywords);
	const capabilities = input.capabilities ?? [];
	const verified = usableCapabilities(capabilities);
	const gaps = detectKnowledgeGaps(
		[...questions, input.topic].filter(Boolean),
		capabilities,
		input.brandName,
	);
	const sources = (research?.sources ?? []).filter((source) => !source.excluded);
	const citations = sources.map((source) => {
		const classification = source.classification ?? 'background';
		const level = evidenceLevel(classification as SourceClass);
		return {
			title: source.title,
			url: source.url,
			classification,
			cite: level === 'verified' || level === 'expert_recommendation',
		};
	});
	const sectionHeads = headingsFromResearch(research, questions);
	const sections: EditorialBriefSection[] = sectionHeads.map((heading, index) => ({
		heading,
		questions: questions[index] ? [questions[index]] : [],
		confirmedEvidence: confirmedFindings.filter((_, findingIndex) => findingIndex % sectionHeads.length === index).slice(0, 4),
		proposedDirection: 'Proposed structure. Confirm against the research before treating it as required.',
		knowledgeGaps: gaps.filter((gap) => gap.question.toLowerCase().includes(heading.toLowerCase().slice(0, 24))).map((gap) => gap.question),
	}));
	if (sections.length && gaps.length) sections[0]!.knowledgeGaps = [...new Set([...sections[0]!.knowledgeGaps, ...gaps.map((gap) => gap.question)])];
	const brand = input.brandName?.trim();
	const confirmed = [
		...confirmedFindings.slice(0, 8).map((item) => `Research: ${item}`),
		...verified.map((item) => `Verified capability: ${item.name} (${item.availability}).`),
	];
	const proposed = [
		input.title ? `Working title: ${input.title}` : `Working title derived from the topic: ${input.topic}`,
		'Section order is a proposal, not a research finding.',
		input.brief?.cta ? `Proposed CTA: ${input.brief.cta}` : 'Proposed CTA: invite the reader to apply the method.',
	];
	return {
		version: (previous?.version ?? 0) + 1,
		createdAt: input.now ?? new Date().toISOString(),
		status: 'draft',
		approvedAt: null,
		title: input.title || input.topic,
		alternativeTitles: input.title ? [`${input.topic}`] : [],
		searchIntent: input.searchIntent,
		primaryKeyword: input.primaryKeyword?.trim() || input.topic,
		supportingKeywords: keywords,
		questions,
		audience: input.audience?.trim() || 'the reader named in the topic',
		readerProblem: input.topic,
		outcome: input.brief?.readerOutcome?.trim() || 'The reader can act on the primary question.',
		brandRelevance: brand
			? verified.length
				? `${brand} is relevant only through verified capabilities: ${verified.map((item) => item.name).join('; ')}.`
				: `${brand} has no verified capability for this topic. Do not imply that it does.`
			: 'No brand is attached.',
		conversionObjective: input.brief?.productConnection?.trim() || 'Help the reader solve the problem. Mention the brand only where a verified capability helps.',
		introduction: `Open by stating the reader problem in the topic: ${input.topic}`,
		sections,
		examples: lines(input.brief?.instructions).filter((line) => /example/i.test(line)),
		internalLinks: lines(input.brief?.requiredLinks).filter((link) => link.startsWith('/') || link.startsWith('http')),
		externalCitations: citations,
		capabilities: capabilities.map((item) => ({
			name: item.name,
			availability: item.availability,
			verified: usableCapabilities([item]).length === 1,
		})),
		claimsToVerify: gaps.map((gap) => gap.question),
		cta: input.brief?.cta?.trim() || 'Close with the practical next step.',
		targetWords: input.targetWords,
		differentiation: input.brief?.differentiateFrom?.trim() || input.brief?.distinctiveContribution?.trim() || '',
		cmsRequirements: [
			input.destinationLabel ? `Destination: ${input.destinationLabel}.` : 'No destination selected.',
			'Body uses Markdown. The CMS title is the only H1.',
			'Tables, lists and links must match the destination capabilities before submission.',
		],
		confirmed,
		proposed,
		instruction: input.instruction?.trim() || previous?.instruction || '',
	};
}

export function approveBriefVersion(version: EditorialBriefVersion, at: string): EditorialBriefVersion {
	return { ...version, status: 'approved', approvedAt: at };
}

/** A change after approval keeps the approved copy in history and marks the new copy as needing approval. */
export function reviseBrief(current: EditorialBriefVersion, next: EditorialBriefVersion): { current: EditorialBriefVersion; history: EditorialBriefVersion[] } {
	if (current.status !== 'approved') return { current: next, history: [] };
	return { current: { ...next, status: 'needs_reapproval', version: current.version + 1 }, history: [current] };
}

export function generationContextFromBrief(version: EditorialBriefVersion | null | undefined): string {
	if (!version || version.status !== 'approved') return '';
	const sections = version.sections
		.map((section) => `${section.heading}: questions ${section.questions.join('; ') || 'none'}; confirmed ${section.confirmedEvidence.join(' | ') || 'none'}; direction ${section.proposedDirection}`)
		.join('\n');
	return [
		'Approved editorial brief. Confirmed lines are evidence. Proposed lines are direction and may be changed. Do not cite sources marked cite:false.',
		`Title: ${version.title}`,
		`Search intent: ${version.searchIntent}`,
		`Audience: ${version.audience}`,
		`Outcome: ${version.outcome}`,
		`Brand: ${version.brandRelevance}`,
		`Conversion: ${version.conversionObjective}`,
		`Introduction: ${version.introduction}`,
		`CTA: ${version.cta}`,
		`Target words: ${version.targetWords}`,
		sections,
		capabilityGuidance(version.capabilities.map((item) => ({ id: item.name, name: item.name, description: item.name, availability: item.availability as ProductCapability['availability'], evidence: item.verified ? 'brief' : undefined, lastVerified: item.verified ? version.approvedAt : null }))),
	].join('\n');
}
