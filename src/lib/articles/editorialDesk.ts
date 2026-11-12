import type { EvidenceLevel, SourceClass } from './sourceClass';
import { classifyFictionalConsistency } from './fictionConsistency';

export type CritiqueSeverity = 'critical' | 'major' | 'minor';

export type CritiqueCategory =
	| 'search_intent'
	| 'usefulness'
	| 'depth'
	| 'accuracy'
	| 'research'
	| 'brand'
	| 'product'
	| 'links'
	| 'citations'
	| 'structure'
	| 'repetition'
	| 'examples'
	| 'seo'
	| 'conversion'
	| 'writing'
	| 'cms';

export type EditorialCritiqueFinding = {
	id: string;
	category: CritiqueCategory;
	severity: CritiqueSeverity;
	section: string | null;
	explanation: string;
	evidence: string[];
	recommendation: string;
	expectedBenefit: string;
	confidence: 'high' | 'medium' | 'low';
	status: 'open' | 'accepted' | 'rejected' | 'deferred' | 'resolved';
};

export type EditorialCritique = {
	revisionId: string | null;
	createdAt: string;
	overall: string;
	strengths: string[];
	weaknesses: string[];
	findings: EditorialCritiqueFinding[];
};

export type RevisionProposal = {
	id: string;
	scope: 'article' | 'section' | 'research' | 'brief' | 'metadata' | 'links' | 'cta';
	section: string | null;
	reason: string;
	action: string;
	benefit: string;
	needsResearch: boolean;
	needsBrandVerification: boolean;
	status: 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'applied';
	sourceFeedback: string;
	sourceFindingId?: string | null;
	sourceRevisionId?: string | null;
	localFix?: { url: string; keepFirst: number } | null;
};

export type RevisionPreview = {
	baseRevisionId: string;
	proposedBody: string;
	summary: string;
	acceptedIds: string[];
	preservedIds: string[];
	wordCountBefore: number;
	wordCountAfter: number;
	createdAt: string;
};

export type EditorialDeskState = {
	critique: EditorialCritique | null;
	feedback: string;
	proposals: RevisionProposal[];
	preview: RevisionPreview | null;
	updatedAt: string | null;
};

export type CritiqueInput = {
	title: string;
	topic: string;
	body: string;
	brandName?: string | null;
	productFacts?: string[];
	sourceClasses?: Array<SourceClass | undefined>;
	sourceTitles?: string[];
	targetWords?: number;
};

const SEVERITY_RANK: Record<CritiqueSeverity, number> = { critical: 0, major: 1, minor: 2 };

function finding(partial: Omit<EditorialCritiqueFinding, 'status' | 'confidence'> & { confidence?: EditorialCritiqueFinding['confidence'] }): EditorialCritiqueFinding {
	return { status: 'open', confidence: partial.confidence ?? 'medium', ...partial };
}

function headings(body: string): string[] {
	return [...body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1]?.trim() ?? '');
}

function firstSection(body: string): string {
	const index = body.search(/^##\s+/m);
	return (index === -1 ? body : body.slice(0, index)).trim();
}

/** Tracks recurring proper nouns and flags incompatible chapter facts in fictional examples. Brand-agnostic. */
export function exampleConsistencyIssues(body: string): string[] {
	const issues: string[] = [];
	const facts = new Map<string, Set<string>>();
	for (const line of body.split('\n')) {
		const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
		if (cells.length < 2 || /^[-:| ]+$/.test(line)) continue;
		const entity = cells[0];
		if (!entity || /entity|character|name/i.test(entity)) continue;
		const fact = cells[1]?.toLowerCase() ?? '';
		if (!fact) continue;
		const bucket = facts.get(entity) ?? new Set<string>();
		bucket.add(fact);
		facts.set(entity, bucket);
	}
	for (const [entity, bucket] of facts) {
		const joined = [...bucket].join(' | ');
		if (/\binjur/.test(joined) && bucket.size > 1 && /no injur|uninjured|healthy/.test(joined) && /injur|wound|broken/.test(joined)) {
			issues.push(`${entity} is described as both injured and uninjured.`);
		}
		if (/chapter\s*3/.test(joined) && /chapter\s*18/.test(joined) && /died|dead|alive/.test(joined)) {
			issues.push(`${entity} has conflicting life-status facts across chapters.`);
		}
	}
	const chapters = [...body.matchAll(/\b(?:chapter|ch\.)\s*(\d+)[^.\n]{0,80}\b(died|dead|alive|injured|uninjured)\b/gi)];
	const byChapter = new Map<string, string>();
	for (const match of chapters) {
		const key = `${match[1]}`;
		const state = match[2]?.toLowerCase() ?? '';
		const prior = byChapter.get(key);
		if (prior && prior !== state && /died|dead|alive|injured|uninjured/.test(prior)) {
			issues.push(`Chapter ${key} records both “${prior}” and “${state}”.`);
		}
		byChapter.set(key, state);
	}
	const tableNames = new Set<string>();
	for (const line of body.split('\n')) {
		if (!line.includes('|')) continue;
		for (const cell of line.split('|')) {
			for (const match of cell.matchAll(/\b[A-Z][a-z]{3,}\b/g)) {
				const name = match[0];
				if (!/^(Chapter|Entity|Established|First|Supporting|Tentative|None|Former|Commands|Crew|Island|Mainland|Story|Bible)$/.test(name)) tableNames.add(name);
			}
		}
	}
	const list = [...tableNames];
	for (let i = 0; i < list.length; i += 1) {
		for (let j = i + 1; j < list.length; j += 1) {
			const a = list[i] ?? '';
			const b = list[j] ?? '';
			if (Math.abs(a.length - b.length) > 1) continue;
			let edits = 0;
			for (let k = 0; k < Math.max(a.length, b.length); k += 1) if (a[k] !== b[k]) edits += 1;
			if (edits === 1) issues.push(`${a} and ${b} look like the same character spelled two ways.`);
		}
	}
	const lunar = /lunar|stranded crew|story bible/i.test(body);
	const island = /ferry|island archive|mainland/i.test(body);
	if (lunar && island) issues.push('The draft mixes a stranded-crew example with a separate island-ferry example that reuses the same first names.');
	return issues;
}

/** Editorial critique that does not rewrite the article. */
export function critiqueDraft(input: CritiqueInput): Omit<EditorialCritique, 'revisionId' | 'createdAt'> {
	const body = input.body.trim();
	const intro = firstSection(body);
	const heads = headings(body);
	const findings: EditorialCritiqueFinding[] = [];
	const brand = input.brandName?.trim();

	const introWords = intro.split(/\s+/).filter(Boolean).length;
	const longGuide = (input.targetWords ?? 0) >= 1200 || body.split(/\s+/).filter(Boolean).length >= 1200;
	if (introWords < 40 && (longGuide || /how to|guide|practical/i.test(`${input.title} ${input.topic}`))) {
		findings.push(
			finding({
				id: 'intro-weak',
				category: 'structure',
				severity: 'major',
				section: heads[0] ?? null,
				explanation: 'The draft opens inside a later section instead of defining the reader’s problem, why it matters, and what the guide will help them do.',
				evidence: [intro.slice(0, 180) || 'No introduction before the first heading.'],
				recommendation: 'Add a short opening before the first H2. Define the problem and the practical promise. Do not rewrite an opening that already does this.',
				expectedBenefit: 'Readers and search systems can see the primary answer immediately.',
				confidence: 'high',
			}),
		);
	}

	if (/continuity/i.test(`${input.title} ${input.topic}`) && !/what is a continuity error|a continuity error (is|happens|occurs)/i.test(body.slice(0, 2500))) {
		findings.push(
			finding({
				id: 'definition-thin',
				category: 'usefulness',
				severity: 'major',
				section: heads[0] ?? null,
				explanation: 'The article does not explain, early and directly, what a continuity error is or how one appears between chapters.',
				evidence: ['No early definition of a continuity error.'],
				recommendation: 'Explain how continuity errors occur and how writers detect them, with one consistent fictional example.',
				expectedBenefit: 'The guide answers the primary question instead of assuming the reader already knows the term.',
			}),
		);
	}

	const fiction = classifyFictionalConsistency(body);
	const accidental = fiction.filter((item) => item.kind === 'accidental');
	const uncertain = fiction.filter((item) => item.kind === 'uncertain');
	if (accidental.length) {
		findings.push(
			finding({
				id: 'example-conflict',
				category: 'examples',
				severity: 'critical',
				section: null,
				explanation: 'Fictional examples contradict each other without presenting the clash as a teaching case.',
				evidence: accidental.flatMap((item) => item.evidence),
				recommendation: 'Keep one cast, setting and timeline. Leave deliberate mistakes only where the article explains them as continuity errors.',
				expectedBenefit: 'The article demonstrates the standard it teaches.',
				confidence: 'high',
			}),
		);
	}
	if (uncertain.length) {
		findings.push(
			finding({
				id: 'example-uncertain',
				category: 'examples',
				severity: 'minor',
				section: null,
				explanation: 'A fictional detail may be inconsistent. It is not clear whether the article is teaching that mistake.',
				evidence: uncertain.flatMap((item) => item.evidence),
				recommendation: 'Leave the passage unchanged until an editor confirms whether the contradiction is intentional.',
				expectedBenefit: 'A teaching example is not rewritten by accident.',
				confidence: 'low',
			}),
		);
	}
	const intentionalExamples = fiction.some((item) => item.kind === 'intentional');

	if (brand && new RegExp(brand, 'i').test(body)) {
		const cautious = /may or may not|it is unclear whether|cannot confirm|not verified|investigate whether|candidate to explore|positioning around/i.test(body);
		const facts = (input.productFacts ?? []).filter(Boolean);
		if (cautious || facts.length === 0) {
			findings.push(
				finding({
					id: 'product-cautious',
					category: 'product',
					severity: 'major',
					section: heads.find((heading) => /software|tool/i.test(heading)) ?? null,
					explanation: facts.length
						? `The draft treats ${brand} cautiously even where verified product facts exist.`
						: `The draft mentions ${brand} without a verified capability list, so product claims stay vague or overly cautious.`,
					evidence: facts.slice(0, 3),
					recommendation: 'Use only verified product capabilities. Do not describe planned features as available, and do not hedge facts that are already verified.',
					expectedBenefit: 'Product relevance improves without unsupported claims.',
				}),
			);
		}
	}

	const competitorHeavy = (input.sourceClasses ?? []).filter((item) => item === 'competitor' || item === 'vendor_marketing').length;
	const independent = (input.sourceClasses ?? []).filter((item) => item === 'primary_evidence' || item === 'expert_guidance').length;
	const titles = input.sourceTitles ?? [];
	const vendorTitles = titles.filter((title) => /best .+ (tool|ai|software)|tools compared|tools tested|vs\.?\s/i.test(title));
	if ((competitorHeavy > 0 && independent < competitorHeavy) || vendorTitles.length >= 2) {
		findings.push(
			finding({
				id: 'vendor-research',
				category: 'research',
				severity: 'major',
				section: heads.find((heading) => /software|tool|compar/i.test(heading)) ?? null,
				explanation: 'Vendor comparison pages are being treated as expert evidence. A vendor’s ranking of tools is marketing, not independent verification.',
				evidence: vendorTitles.slice(0, 4).length ? vendorTitles.slice(0, 4) : [`Competitor-class sources: ${competitorHeavy}. Independent expert or primary sources: ${independent}.`],
				recommendation: 'Separate competitor marketing from independent commentary. Do not cite vendor rankings as proof.',
				expectedBenefit: 'The software section can be used by a buyer without repeating another vendor’s claims.',
			}),
		);
	}

	const answerCues = [/what is a continuity error/i, /how do writers track/i, /contradict/i, /can software|software help/i];
	const missingAnswers = answerCues.filter((pattern) => !pattern.test(body)).length;
	if (missingAnswers >= 2) {
		findings.push(
			finding({
				id: 'answers-indirect',
				category: 'seo',
				severity: 'minor',
				section: null,
				explanation: 'Several natural reader questions are not answered in plain language near the relevant section.',
				evidence: ['Direct answers for definition, detection and software fit are thin or absent.'],
				recommendation: 'Answer those questions in the prose. Do not add a stuffed FAQ.',
				expectedBenefit: 'The article is easier to use without keyword stuffing.',
			}),
		);
	}

	const lastHeading = body.lastIndexOf('\n##');
	const ending = lastHeading === -1 ? body.slice(-400) : body.slice(lastHeading);
	const explainsProduct = brand ? new RegExp(`${brand}.{0,80}(memory|canon|review|continuity|manuscript)`, 'i').test(ending) : /\b(next|checklist|reread)\b/i.test(ending);
	if (!explainsProduct) {
		findings.push(
			finding({
				id: 'cta-weak',
				category: 'conversion',
				severity: 'major',
				section: heads.at(-1) ?? null,
				explanation: 'The close names a next step but does not explain why the product is relevant to the reader’s problem.',
				evidence: [ending.slice(-220)],
				recommendation: 'Close by restating the practical check and why the product is relevant, using verified capabilities only.',
				expectedBenefit: 'The ending helps the reader act instead of trailing off.',
			}),
		);
	}

	findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
	const strengths: string[] = [];
	if (/\|.+\|/.test(body)) strengths.push('Practical tables or checklists are present and should be preserved.');
	if (heads.length >= 4) strengths.push('The article already has a multi-section structure a reader can scan.');
	if (/\bchapter\b/i.test(body)) strengths.push('It uses manuscript-level examples rather than only abstract advice.');
	if (intentionalExamples) strengths.push('Deliberate continuity mistakes are explained as examples.');
	const weaknesses = findings.map((item) => item.explanation);
	const overall = findings.some((item) => item.severity === 'critical' || item.severity === 'major')
		? 'The draft has useful practical material, but it does not yet fully achieve an authoritative guide: the opening, examples, evidence, or product positioning need directed revision.'
		: 'The draft substantially matches its intent. Remaining notes are refinements.';
	return { overall, strengths, weaknesses, findings };
}

export function planFromFeedback(feedback: string, body: string): RevisionProposal[] {
	const text = feedback.trim();
	if (!text) return [];
	const heads = headings(body);
	const proposals: RevisionProposal[] = [];
	const add = (partial: Omit<RevisionProposal, 'id' | 'status' | 'sourceFeedback'>) => {
		proposals.push({
			...partial,
			id: `proposal-${proposals.length + 1}`,
			status: 'proposed',
			sourceFeedback: text,
		});
	};
	if (/intro|open with|opening/i.test(text)) {
		add({
			scope: 'section',
			section: heads[0] ?? 'Introduction',
			reason: 'The feedback asks for a stronger opening.',
			action: 'Add a realistic continuity mistake before the first H2, then state what the guide will help the reader do.',
			benefit: 'The primary question is answered early.',
			needsResearch: false,
			needsBrandVerification: false,
		});
	}
	if (/example|consistent|contradict/i.test(text)) {
		add({
			scope: 'article',
			section: null,
			reason: 'The feedback asks for consistent fictional examples.',
			action: 'Keep one cast, timeline and set of injuries. Update later mentions that disagree. Do not change unrelated sections.',
			benefit: 'Examples stop undermining the method.',
			needsResearch: false,
			needsBrandVerification: false,
		});
	}
	if (/continuity error|detect|how writers/i.test(text)) {
		add({
			scope: 'section',
			section: heads[0] ?? null,
			reason: 'The feedback asks for a clearer explanation of how errors occur and how writers find them.',
			action: 'Explain causes (revision, time, character state) and a detection pass. Preserve existing tables.',
			benefit: 'The guide teaches the skill, not only the tooling.',
			needsResearch: false,
			needsBrandVerification: false,
		});
	}
	if (/brand|product|capabilit|cautious|verified/i.test(text)) {
		add({
			scope: 'section',
			section: heads.find((heading) => /software|tool/i.test(heading)) ?? null,
			reason: 'The feedback asks for verified product language instead of unnecessary caution.',
			action: 'Rewrite the product passage using only verified capabilities. Leave a knowledge-gap note where a claim is unverified.',
			benefit: 'Commercial relevance without invented features.',
			needsResearch: false,
			needsBrandVerification: true,
		});
	}
	if (/research|source|competitor|independent/i.test(text)) {
		add({
			scope: 'research',
			section: heads.find((heading) => /software|tool|compar/i.test(heading)) ?? null,
			reason: 'The feedback asks to separate independent evidence from competitor marketing.',
			action: 'Do not cite competitor rankings as independent proof. Prefer primary or expert sources already approved; flag gaps instead of inventing citations.',
			benefit: 'The comparison can be trusted.',
			needsResearch: true,
			needsBrandVerification: false,
		});
	}
	if (/cta|close|ending|relevant/i.test(text)) {
		add({
			scope: 'cta',
			section: heads.at(-1) ?? null,
			reason: 'The feedback asks for a stronger close.',
			action: 'End with the practical next check and why the product fits that job, using verified capabilities only.',
			benefit: 'The reader leaves with an action.',
			needsResearch: false,
			needsBrandVerification: true,
		});
	}
	if (/table|checklist|preserve/i.test(text)) {
		add({
			scope: 'article',
			section: null,
			reason: 'The feedback says to keep practical tables and checklists.',
			action: 'Do not remove or restyle existing tables and checklists except where an accepted example-consistency change requires a cell edit.',
			benefit: 'Useful artefacts survive the revision.',
			needsResearch: false,
			needsBrandVerification: false,
		});
	}
	if (/word/i.test(text)) {
		add({
			scope: 'article',
			section: null,
			reason: 'The feedback sets a length constraint.',
			action: 'Stay near the requested word count. Do not pad and do not cut the preserved tables.',
			benefit: 'Length stays intentional.',
			needsResearch: false,
			needsBrandVerification: false,
		});
	}
	if (!proposals.length) {
		add({
			scope: 'article',
			section: null,
			reason: 'Free-text editorial feedback.',
			action: text,
			benefit: 'The revision follows the editor’s instruction rather than a generic rewrite.',
			needsResearch: /research|source|evidence/i.test(text),
			needsBrandVerification: /product|brand|feature|capabilit/i.test(text),
		});
	}
	return proposals;
}

export function reconcileCritique(previous: EditorialCritique | null, next: Omit<EditorialCritique, 'revisionId' | 'createdAt'>): Omit<EditorialCritique, 'revisionId' | 'createdAt'> {
	const nextIds = new Set(next.findings.map((item) => item.id));
	const resolved = (previous?.findings ?? [])
		.filter((item) => item.status !== 'resolved' && !nextIds.has(item.id))
		.map((item) => ({ ...item, status: 'resolved' as const }));
	return { ...next, findings: [...next.findings, ...resolved] };
}

export function emptyEditorialDesk(): EditorialDeskState {
	return { critique: null, feedback: '', proposals: [], preview: null, updatedAt: null };
}

export type { EvidenceLevel };
