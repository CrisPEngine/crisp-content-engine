import type { ArticleBriefDetails, ResearchPackage } from './types';
import { evidenceLevel, type SourceClass } from './sourceClass';
import { capabilityGuidance, detectKnowledgeGaps, usableCapabilities, type ProductCapability } from './productKnowledge';

export type BriefBasis = 'confirmed' | 'proposed';

export type EditorialBriefSection = {
	heading: string;
	level?: 2 | 3;
	parentHeading?: string | null;
	questions: string[];
	confirmedEvidence: string[];
	proposedDirection: string;
	knowledgeGaps: string[];
	examples?: string[];
	exercises?: string[];
	takeaways?: string[];
	evidenceNeeded?: string[];
	researchGap?: boolean;
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
	seoTitle?: string;
	publishedH1?: string;
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
	const sources = (research?.sources ?? []).filter((source) => !source.excluded);
	const vendorSourceIds = new Set(sources.filter((source) => source.classification === 'vendor_marketing' || source.classification === 'competitor').map((source) => source.id));
	const confirmedFindings = (approved ? research?.approved?.items ?? research?.items ?? [] : [])
		.filter((item) => item && !item.excluded && item.supported)
		.filter((item) => !(item.sourceIds.length && item.sourceIds.every((id) => vendorSourceIds.has(id))))
		.filter((item) => !/\b(best|top)\b.{0,40}\b(tool|software|ai)\b|\bwas built to\b/i.test(item.text))
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
	const sections: EditorialBriefSection[] = sectionHeads.map((heading, index) => {
		const confirmedEvidence = confirmedFindings.filter((_, findingIndex) => findingIndex % sectionHeads.length === index).slice(0, 4);
		return {
			heading,
			level: 2 as const,
			questions: questions[index] ? [questions[index]] : [],
			confirmedEvidence,
			proposedDirection: 'Proposed structure. Confirm against the research before treating it as required.',
			knowledgeGaps: gaps.filter((gap) => gap.question.toLowerCase().includes(heading.toLowerCase().slice(0, 24))).map((gap) => gap.question),
			examples: [],
			exercises: [],
			takeaways: [],
			evidenceNeeded: confirmedEvidence.length ? [] : ['Independent evidence for the claim this section will make.'],
			researchGap: confirmedEvidence.length === 0,
		};
	});
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
		seoTitle: input.title || input.topic,
		publishedH1: input.title || input.topic,
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

export type ModelBriefStrategy = {
	primaryKeyword?: string;
	supportingKeywords?: string[];
	searchIntent?: string;
	audience?: string;
	seoTitle?: string;
	publishedH1?: string;
	alternativeTitles?: string[];
	sections?: Array<{
		heading?: string;
		level?: number;
		parentHeading?: string;
		questions?: string[];
		examples?: string[];
		exercises?: string[];
		takeaways?: string[];
		evidenceNeeded?: string[];
		proposedDirection?: string;
	}>;
	internalLinks?: string[];
	cta?: string;
	targetWords?: number;
	differentiation?: string;
	brandPositioning?: string;
};

const UNSUPPORTED_METRIC = /\d[\d,.]*\s*(monthly searches|searches a month|search volume|msv)|#\s*\d+|\brank(?:s|ed|ing)?\b/i;
const KNOWN_TYPOS: Record<string, string> = {
	cheeck: 'check',
	recieve: 'receive',
	seperate: 'separate',
	continuty: 'continuity',
	continutiy: 'continuity',
	writting: 'writing',
	occured: 'occurred',
	definately: 'definitely',
	wierd: 'weird',
	artical: 'article',
	audence: 'audience',
	sentance: 'sentence',
	charactor: 'character',
	chapeter: 'chapter',
};
const COMMON_WORDS = new Set(
	'about after also article audience because before between chapter character check continuity draft error errors example fiction guide method novel novels practical prevent reader scene story stories structure writer writers writing workflow'
		.split(' '),
);
const STOP_WORDS = new Set('the a an and or to of for in on with how what your this that from into by is are was were be as at it its their they them you'.split(' '));

function cleanProposal(value: string | undefined, limit = 240): string {
	const text = (value ?? '').replace(/\s+/g, ' ').trim();
	if (!text || UNSUPPORTED_METRIC.test(text)) return '';
	return text.slice(0, limit);
}

function significantTokens(value: string): string[] {
	return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 3 && !STOP_WORDS.has(token));
}

function editDistance(left: string, right: string): number {
	const row = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let i = 1; i <= left.length; i += 1) {
		let previous = row[0]!;
		row[0] = i;
		for (let j = 1; j <= right.length; j += 1) {
			const current = row[j]!;
			row[j] = left[i - 1] === right[j - 1] ? previous : Math.min(previous, row[j]!, row[j - 1]!) + 1;
			previous = current;
		}
	}
	return row[right.length]!;
}

function spellingSuggestion(word: string, lexicon: Set<string>): string | null {
	if (word.length < 5 || lexicon.has(word) || COMMON_WORDS.has(word)) return null;
	if (KNOWN_TYPOS[word]) return KNOWN_TYPOS[word];
	let suggestion: string | null = null;
	for (const known of [...lexicon, ...COMMON_WORDS]) {
		if (Math.abs(known.length - word.length) > 1 || known[0] !== word[0]) continue;
		if (editDistance(word, known) === 1) suggestion = known;
	}
	return suggestion;
}

function keywordPhrase(value: string): string {
	return significantTokens(value).map((token) => (token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token)).join(' ');
}

/** Drops unsupported, misspelled, duplicate, or off-topic keyword proposals. Confirmed research is untouched. */
export function validateProposedKeywords(keywords: string[], context: { topic: string; title: string; searchIntent: string; primaryKeyword: string }): { keywords: string[]; notes: string[] } {
	const lexicon = new Set(significantTokens([context.topic, context.title, context.searchIntent, context.primaryKeyword].join(' ')));
	const kept: string[] = [];
	const notes: string[] = [];
	const seen = new Set<string>();
	for (const keyword of keywords) {
		const cleaned = cleanProposal(keyword, 80);
		if (!cleaned) {
			if (keyword.trim()) notes.push(`Rejected keyword “${keyword.trim().slice(0, 80)}”: unsupported search metric or ranking claim.`);
			continue;
		}
		const words = cleaned.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
		const misspelled = words.map((word) => ({ word, suggestion: spellingSuggestion(word, lexicon) })).find((item) => item.suggestion);
		if (misspelled) {
			notes.push(`Rejected keyword “${cleaned}”: “${misspelled.word}” looks like a misspelling of “${misspelled.suggestion}”.`);
			continue;
		}
		const phrase = keywordPhrase(cleaned);
		const primaryPhrase = keywordPhrase(context.primaryKeyword);
		if (!phrase || seen.has(phrase) || phrase === primaryPhrase) {
			notes.push(`Rejected keyword “${cleaned}”: duplicate or near-duplicate of another keyword.`);
			continue;
		}
		const tokens = significantTokens(cleaned);
		if (tokens.length && !tokens.some((token) => lexicon.has(token))) {
			notes.push(`Check keyword “${cleaned}”: it does not share words with the topic or search intent.`);
		}
		seen.add(phrase);
		kept.push(cleaned);
	}
	return { keywords: kept, notes };
}

function headingKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function articleNeedsSubsections(topic: string, title: string, targetWords: number): boolean {
	return targetWords >= 1600 && /\b(how to|guide|practical|workflow|prevent|method)\b/i.test(`${topic} ${title}`);
}

/** Removes duplicate or irrelevant headings and adds an H3 only when a long practical article already has a second question. */
export function validateProposedSections(sections: EditorialBriefSection[], context: { topic: string; title: string; targetWords: number }): { sections: EditorialBriefSection[]; notes: string[] } {
	const lexicon = new Set(significantTokens(`${context.topic} ${context.title}`));
	const notes: string[] = [];
	const seen = new Set<string>();
	const relevant = sections.filter((section) => {
		const key = headingKey(section.heading);
		if (!key || seen.has(key)) {
			notes.push(`Rejected heading “${section.heading}”: duplicate.`);
			return false;
		}
		const tokens = significantTokens(section.heading);
		if (tokens.length && !tokens.some((token) => lexicon.has(token) || COMMON_WORDS.has(token))) {
			notes.push(`Check heading “${section.heading}”: it does not share words with the topic.`);
		}
		seen.add(key);
		return true;
	});
	const normalized: EditorialBriefSection[] = [];
	for (const section of relevant) {
		const level = section.level === 3 ? 3 : 2;
		const parent = level === 3 ? normalized.filter((item) => item.level !== 3).at(-1)?.heading ?? null : null;
		normalized.push({ ...section, level: parent || level === 2 ? level : 2, parentHeading: parent });
		if (level === 3 && !parent) notes.push(`Heading “${section.heading}” was kept as an H2 because it had no parent section.`);
	}
	const needsSubsections = articleNeedsSubsections(context.topic, context.title, context.targetWords);
	if (!needsSubsections || normalized.some((section) => section.level === 3)) return { sections: normalized, notes };
	let added = false;
	const withSubsections: EditorialBriefSection[] = [];
	for (const section of normalized) {
		withSubsections.push(section);
		const extra = section.questions.slice(1).map((question) => question.replace(/\?$/, '').trim()).filter(Boolean);
		for (const heading of extra.slice(0, 2)) {
			if (seen.has(headingKey(heading))) continue;
			seen.add(headingKey(heading));
			withSubsections.push({
				heading,
				level: 3,
				parentHeading: section.heading,
				questions: [section.questions.find((question) => question.replace(/\?$/, '').trim() === heading) ?? heading],
				confirmedEvidence: [],
				proposedDirection: 'Proposed subsection from a reader question. It is not a research finding.',
				knowledgeGaps: [],
				examples: [],
				exercises: [],
				takeaways: [],
				evidenceNeeded: ['Evidence specific to this subsection.'],
				researchGap: true,
			});
			added = true;
		}
	}
	if (!added) notes.push('No H3 was added. The outline does not have a section with a distinct second question.');
	return { sections: withSubsections, notes };
}

function cleanList(values: string[] | undefined, limit = 8): string[] {
	return (values ?? []).map((item) => cleanProposal(item)).filter(Boolean).slice(0, limit);
}

/** Merges model strategy into a deterministic brief. Confirmed evidence and verified capabilities are not replaced. */
export function applyModelStrategy(base: EditorialBriefVersion, model: ModelBriefStrategy | null | undefined, existingTitles: string[] = []): EditorialBriefVersion {
	if (!model) return base;
	const positioning = cleanProposal(model.brandPositioning, 400);
	const mentionsUnverified = Boolean(positioning) && base.capabilities.some((item) => !item.verified && positioning.toLowerCase().includes(item.name.toLowerCase()));
	const words = Number(model.targetWords);
	const targetWords = Number.isFinite(words) && words >= 400 && words <= 6000 ? Math.round(words) : base.targetWords;
	const inventory = existingTitles.map((title) => title.trim()).filter(Boolean);
	const differentiation = [cleanProposal(model.differentiation, 500), inventory.length ? `Do not repeat: ${inventory.slice(0, 8).join('; ')}.` : ''].filter(Boolean).join(' ');
	const modelSections = (model.sections ?? []).flatMap((section) => {
		const heading = cleanProposal(section.heading, 120);
		if (!heading) return [];
		const confirmedEvidence = base.sections.find((item) => item.heading.toLowerCase() === heading.toLowerCase())?.confirmedEvidence ?? [];
		const evidenceNeeded = cleanList(section.evidenceNeeded, 4);
		const built: EditorialBriefSection = {
			heading,
			level: section.level === 3 ? 3 : 2,
			parentHeading: cleanProposal(section.parentHeading, 120) || null,
			questions: cleanList(section.questions, 4),
			confirmedEvidence,
			proposedDirection: cleanProposal(section.proposedDirection, 400) || 'Proposed section. It is not a research finding.',
			knowledgeGaps: [],
			examples: cleanList(section.examples, 3),
			exercises: cleanList(section.exercises, 3),
			takeaways: cleanList(section.takeaways, 3),
			evidenceNeeded,
			researchGap: confirmedEvidence.length === 0,
		};
		return [built];
	});
	const proposedPrimary = cleanProposal(model.primaryKeyword, 80);
	const primaryTypo = proposedPrimary
		?.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.map((word) => ({ word, suggestion: spellingSuggestion(word, new Set(significantTokens(`${base.readerProblem} ${base.title} ${base.searchIntent}`))) }))
		.find((item) => item.suggestion);
	const primaryKeyword = primaryTypo ? base.primaryKeyword : proposedPrimary || base.primaryKeyword;
	const keywordCheck = validateProposedKeywords(
		cleanList(model.supportingKeywords, 12).length ? cleanList(model.supportingKeywords, 12) : base.supportingKeywords,
		{ topic: base.readerProblem, title: base.title, searchIntent: base.searchIntent, primaryKeyword },
	);
	if (primaryTypo) keywordCheck.notes.unshift(`Rejected primary keyword “${proposedPrimary}”: “${primaryTypo.word}” looks like a misspelling of “${primaryTypo.suggestion}”.`);
	const sectionCheck = validateProposedSections(modelSections.length ? modelSections : base.sections, {
		topic: base.readerProblem,
		title: base.title,
		targetWords,
	});
	const proposed = [
		...base.proposed,
		modelSections.length ? 'Section structure was proposed by the strategy model and still requires approval.' : '',
		model.searchIntent && model.searchIntent !== base.searchIntent ? `Proposed search intent: ${cleanProposal(model.searchIntent, 80)}. The article intent stays ${base.searchIntent}.` : '',
		...keywordCheck.notes,
		...sectionCheck.notes,
	].filter(Boolean);
	return {
		...base,
		primaryKeyword,
		supportingKeywords: keywordCheck.keywords,
		searchIntent: base.searchIntent || cleanProposal(model.searchIntent, 80) || base.searchIntent,
		audience: cleanProposal(model.audience, 160) || base.audience,
		seoTitle: cleanProposal(model.seoTitle, 70) || base.seoTitle,
		publishedH1: cleanProposal(model.publishedH1, 120) || base.publishedH1,
		alternativeTitles: cleanList(model.alternativeTitles, 4).length ? cleanList(model.alternativeTitles, 4) : base.alternativeTitles,
		sections: sectionCheck.sections,
		internalLinks: cleanList(model.internalLinks, 8).length ? cleanList(model.internalLinks, 8) : base.internalLinks,
		cta: cleanProposal(model.cta, 240) || base.cta,
		targetWords,
		differentiation: differentiation || base.differentiation,
		brandRelevance: mentionsUnverified ? base.brandRelevance : positioning || base.brandRelevance,
		proposed,
		confirmed: base.confirmed,
		capabilities: base.capabilities,
	};
}

export function sectionResearchQuestion(section: Pick<EditorialBriefSection, 'heading' | 'questions' | 'evidenceNeeded'>): string {
	const questions = section.questions.length ? section.questions.join(' ') : `What must “${section.heading}” establish?`;
	const needed = (section.evidenceNeeded ?? []).join(' ');
	return `Research only this section: ${section.heading}. ${questions} ${needed}`.replace(/\s+/g, ' ').trim();
}
