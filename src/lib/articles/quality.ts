import type { ReviewFinding } from './editorialReview';
import { normaliseUrl } from './researchPackage';
import { parseSections, plainText } from './structure';

/**
 * Deterministic quality checks that look across sections: repeated ideas (not only identical sentences),
 * link and citation concentration, overlap with existing site content, and practical value.
 */

const STOP = new Set(
	(
		'a about above after again against all also am an and any are as at be because been before being below between both but by can could ' +
		'did do does doing down during each even every few for from further get gets getting go going had has have having he her here hers ' +
		'him his how i if in into is it its itself just let lets like make makes many may me more most much must my no nor not now of off ' +
		'on once one only or other our ours out over own really same she should so some something still such than that the their theirs ' +
		'them then there these they thing things this those through to too under until up us very want was way we were what when where ' +
		'which while who whom why will with without would yet you your yours yourself'
	).split(' '),
);

function stem(word: string): string {
	if (word.length <= 4) return word;
	return word
		.replace(/(ations?|ition|ments?|ness|ingly|edly)$/u, '')
		.replace(/(ing|ers|ies|ied|ed|es|er|ly|s)$/u, '')
		.replace(/e$/u, '');
}

export function contentTerms(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[’']/g, '')
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2 && !STOP.has(word))
		.map(stem)
		.filter((word) => word.length > 2);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (!a.size || !b.size) return 0;
	let shared = 0;
	for (const item of a) if (b.has(item)) shared += 1;
	return shared / (a.size + b.size - shared);
}

function sentencesOf(markdown: string): string[] {
	return plainText(markdown)
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter((sentence) => sentence.length > 30);
}

type Section = { heading: string; body: string };

function sectionsOf(body: string): Section[] {
	return parseSections(body).map((section) => ({ heading: section.heading || 'Introduction', body: section.body }));
}

function quote(text: string, max = 140): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function listSections(names: string[]): string {
	const quoted = names.map((name) => `“${name}”`);
	if (quoted.length <= 2) return quoted.join(' and ');
	return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

/**
 * Rhetorical moves that advice articles tend to restate in every section. Each is matched within one sentence so
 * that a topic word alone does not count.
 */
const CONCEPTS: Array<{ id: string; label: string; pattern: RegExp }> = [
	{
		id: 'preparation_as_avoidance',
		label: 'preparation turning into procrastination or avoidance',
		pattern: /\b(prepar\w*|plan\w*|outlin\w*|research\w*|world-?build\w*)\b[^.!?]{0,80}\b(procrastinat\w*|avoid\w*|delay\w*|stall\w*|excuse\w*|put(ting)? off|never (start|begin)\w*)\b|\b(procrastinat\w*|avoid\w*|stall\w*)\b[^.!?]{0,80}\b(prepar\w*|plan\w*|outlin\w*|research\w*)\b/i,
	},
	{
		id: 'small_commitment',
		label: 'keeping the commitment small or manageable',
		pattern: /\b(small|smaller|manageable|modest|realistic|tiny|achievable|sustainable)\b\s+(\w+\s+){0,2}(commitment|goal|target|session|step|block|chunk|habit|routine|amount|promise)s?\b/i,
	},
	{
		id: 'no_need_to_prove',
		label: 'the draft not needing to prove ability or talent',
		pattern: /\b(prove|proof|verdict|test|judg\w*|measure)\b[^.!?]{0,60}\b(talent|abilit\w*|whether you can|good enough|real writer|worth)\b|\bdoes(n’t|n't| not) (have|need) to (prove|be (perfect|good|brilliant))/i,
	},
	{
		id: 'imperfect_first_draft',
		label: 'the first draft being allowed to be imperfect',
		pattern: /\b(first|rough|early|messy|zero) drafts?\b[^.!?]{0,60}\b(perfect\w*|messy|bad|ugly|rough|imperfect|flawed|not (good|polished))\b|\b(perfect\w*|polish\w*)\b[^.!?]{0,40}\b(first|rough) drafts?\b/i,
	},
	{
		id: 'momentum_over_quality',
		label: 'momentum or consistency mattering more than quality',
		pattern: /\b(momentum|consistency|showing up|keep going|keep moving)\b[^.!?]{0,60}\b(matter\w*|more than|over|instead of|rather than)\b/i,
	},
	{
		id: 'word_count_planner_pitch',
		label: 'repeated Word Count Planner promotion',
		pattern: /\b(word[- ]count planner|\/tools\/word-count-planner)\b/i,
	},
	{
		id: 'novel_guide_handoff',
		label: 'repeated hand-off to the novel-writing guide',
		pattern: /\b(how to write a novel|novel[- ]writing guide|\/articles\/how-to-write-a-novel)\b/i,
	},
];

export type QualityContext = {
	body: string;
	wordCount: number;
	title?: string;
	primaryKeyword?: string | null;
	/** Hostnames that count as this site. */
	siteHosts?: string[];
	/** Brand and tool names whose repeated mention reads as promotion. */
	promotedNames?: string[];
	/** Known internal URLs (articles, tools, pages). When given, unknown internal links are flagged. */
	inventory?: InventoryItem[];
	/** Existing articles this one must not duplicate. */
	related?: RelatedArticle[];
	contentType?: string;
};

export type InventoryItem = { url: string; title?: string };
export type RelatedArticle = { title: string; url?: string | null; primaryKeyword?: string | null; body?: string | null };

export type LinkUse = { url: string; key: string; anchor: string; section: string; internal: boolean; host: string };

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

export function extractLinks(body: string, siteHosts: string[] = []): LinkUse[] {
	const hosts = siteHosts.map((item) => item.toLowerCase().replace(/^www\./, ''));
	const links: LinkUse[] = [];
	for (const section of sectionsOf(body)) {
		for (const match of section.body.matchAll(LINK_RE)) {
			const host = hostOf(match[2]);
			links.push({
				url: match[2],
				key: normaliseUrl(match[2]),
				anchor: match[1],
				section: section.heading,
				internal: hosts.some((item) => host === item || host.endsWith(`.${item}`)),
				host,
			});
		}
	}
	return links;
}

/** Ideas restated across sections, by concept pattern, shared phrasing and near-duplicate sentences. */
export function repetitionFindings(ctx: QualityContext): ReviewFinding[] {
	const sections = sectionsOf(ctx.body);
	if (sections.length < 2) return [];
	const findings: ReviewFinding[] = [];
	const reported = new Set<string>();

	for (const concept of CONCEPTS) {
		const hits = sections
			.map((section) => ({ section: section.heading, sentence: sentencesOf(section.body).find((sentence) => concept.pattern.test(sentence)) }))
			.filter((hit): hit is { section: string; sentence: string } => Boolean(hit.sentence));
		if (hits.length < 3) continue;
		const [keep, ...rest] = hits;
		reported.add(concept.id);
		findings.push({
			severity: 'major',
			code: 'repeated_idea',
			source: 'deterministic',
			dimension: 'writing_quality',
			section: keep.section,
			evidence: hits.map((hit) => `${hit.section}: “${quote(hit.sentence)}”`),
			explanation: `The idea of ${concept.label} is restated in ${hits.length} sections. Readers notice the repetition, and each restatement takes the place of new, useful material.`,
			instruction: `Make the point about ${concept.label} once, in “${keep.section}”. In ${listSections(rest.map((hit) => hit.section))}, cut the restatement and use the space for a concrete example or step that belongs to that section.`,
		});
	}

	const keywordTerms = new Set(contentTerms(`${ctx.title ?? ''} ${ctx.primaryKeyword ?? ''}`));
	const headingTerms = new Set(sections.flatMap((section) => contentTerms(section.heading)));
	const shingleSections = new Map<string, Map<string, string>>();
	for (const section of sections) {
		for (const sentence of sentencesOf(section.body)) {
			const terms = contentTerms(sentence);
			for (let index = 0; index + 3 <= terms.length; index += 1) {
				const gram = terms.slice(index, index + 3);
				if (gram.every((term) => keywordTerms.has(term) || headingTerms.has(term))) continue;
				if (new Set(gram).size < 3) continue;
				const key = gram.join(' ');
				const bySection = shingleSections.get(key) ?? new Map<string, string>();
				if (!bySection.has(section.heading)) bySection.set(section.heading, sentence);
				shingleSections.set(key, bySection);
			}
		}
	}
	const phrases = [...shingleSections.entries()]
		.filter(([, bySection]) => bySection.size >= 3)
		.sort((a, b) => b[1].size - a[1].size);
	const coveredSentences = new Set(findings.flatMap((finding) => finding.evidence ?? []));
	let phraseFindings = 0;
	for (const [, bySection] of phrases) {
		if (phraseFindings >= 3) break;
		const hits = [...bySection.entries()].map(([section, sentence]) => ({ section, sentence }));
		const evidence = hits.map((hit) => `${hit.section}: “${quote(hit.sentence)}”`);
		if (evidence.every((item) => coveredSentences.has(item))) continue;
		evidence.forEach((item) => coveredSentences.add(item));
		phraseFindings += 1;
		findings.push({
			severity: 'minor',
			code: 'repeated_phrasing',
			source: 'deterministic',
			dimension: 'writing_quality',
			section: hits[0].section,
			evidence,
			explanation: `The same phrasing appears in ${hits.length} sections, which usually means the same point is being made again.`,
			instruction: `Keep this point in “${hits[0].section}” and rephrase or cut it in ${listSections(hits.slice(1).map((hit) => hit.section))}.`,
		});
	}

	const sentenceSets = sections.flatMap((section) =>
		sentencesOf(section.body)
			.map((sentence) => ({ section: section.heading, sentence, terms: new Set(contentTerms(sentence)) }))
			.filter((entry) => entry.terms.size >= 6),
	);
	const pairs: Array<{ a: (typeof sentenceSets)[number]; b: (typeof sentenceSets)[number]; score: number }> = [];
	for (let i = 0; i < sentenceSets.length; i += 1) {
		for (let j = i + 1; j < sentenceSets.length; j += 1) {
			if (sentenceSets[i].section === sentenceSets[j].section) continue;
			const score = jaccard(sentenceSets[i].terms, sentenceSets[j].terms);
			if (score >= 0.45 && sentenceSets[i].sentence.toLowerCase() !== sentenceSets[j].sentence.toLowerCase()) {
				pairs.push({ a: sentenceSets[i], b: sentenceSets[j], score });
			}
		}
	}
	if (pairs.length) {
		pairs.sort((x, y) => y.score - x.score);
		findings.push({
			severity: pairs.length >= 3 ? 'major' : 'minor',
			code: 'near_duplicate_sentences',
			source: 'deterministic',
			dimension: 'writing_quality',
			section: pairs[0].b.section,
			evidence: pairs.slice(0, 4).map((pair) => `“${quote(pair.a.sentence, 100)}” (${pair.a.section}) ≈ “${quote(pair.b.sentence, 100)}” (${pair.b.section})`),
			explanation: `${pairs.length} sentence pair${pairs.length === 1 ? '' : 's'} in different sections say almost the same thing in different words.`,
			instruction: 'For each pair, keep the version in the section where the point belongs and cut or replace the other.',
		});
	}
	return findings;
}

export function linkFindings(ctx: QualityContext): ReviewFinding[] {
	const links = extractLinks(ctx.body, ctx.siteHosts);
	if (!links.length) return [];
	const findings: ReviewFinding[] = [];
	const byUrl = new Map<string, LinkUse[]>();
	for (const link of links) byUrl.set(link.key, [...(byUrl.get(link.key) ?? []), link]);
	for (const uses of byUrl.values()) {
		if (uses.length < 2) continue;
		const first = uses[0];
		const sections = [...new Set(uses.map((use) => use.section))];
		const limit = first.internal ? 1 : 2;
		if (uses.length <= limit) continue;
		findings.push({
			severity: uses.length >= 4 ? 'major' : 'minor',
			code: first.internal ? 'repeated_internal_link' : 'repeated_citation',
			source: 'deterministic',
			dimension: first.internal ? 'internal_linking' : 'sources',
			section: first.section,
			evidence: [`${first.url} is linked ${uses.length} times, in ${listSections(sections)}.`, ...uses.slice(0, 4).map((use) => `${use.section}: [${use.anchor}]`)],
			explanation: first.internal
				? 'Linking the same page again does not help the reader or search engines, and repeated product links read as promotion.'
				: 'Citing the same source again and again makes the article read as a summary of one page rather than its own guidance.',
			instruction: `Keep the link to ${first.url} once, in “${first.section}”, where it is first useful. Remove the other links and keep their anchor text as plain words where the sentence still needs it.`,
			proposedFix: `Remove ${uses.length - 1} repeat link${uses.length - 1 === 1 ? '' : 's'} to ${first.url}; keep the one in “${first.section}”.`,
			fix: { kind: 'unlink_repeats', url: first.url, keepFirst: 1 },
		});
	}
	const external = links.filter((link) => !link.internal);
	const byHost = new Map<string, LinkUse[]>();
	for (const link of external) byHost.set(link.host, [...(byHost.get(link.host) ?? []), link]);
	for (const [host, uses] of byHost) {
		if (uses.length < 4) continue;
		if (new Set(uses.map((use) => use.key)).size === 1) continue;
		findings.push({
			severity: 'major',
			code: 'citation_concentration',
			source: 'deterministic',
			dimension: 'sources',
			section: uses[0].section,
			evidence: [`${uses.length} links go to ${host}, across ${listSections([...new Set(uses.map((use) => use.section))])}.`],
			explanation: 'When one outside site supplies most of the support, the article reads as borrowed and sends readers away repeatedly.',
			instruction: `Cite ${host} where it supports a specific claim, at most twice. Make the remaining points in the article’s own words without a link.`,
		});
	}
	const perThousand = ctx.wordCount ? (external.length / ctx.wordCount) * 1000 : 0;
	if (external.length > 6 && perThousand > 5) {
		findings.push({
			severity: 'minor',
			code: 'excessive_external_links',
			source: 'deterministic',
			dimension: 'sources',
			evidence: [`${external.length} external links in ${ctx.wordCount.toLocaleString()} words (${perThousand.toFixed(1)} per 1,000).`],
			explanation: 'Link only where a source supports a specific claim or gives the reader something the article does not.',
			instruction: 'Remove external links that do not support a specific claim.',
		});
	}
	if (ctx.inventory?.length) {
		const known = new Set(ctx.inventory.map((item) => normaliseUrl(item.url)));
		const sectionOf = (key: string) => key.split('/')[1] ?? '';
		const knownSections = new Set([...known].map(sectionOf).filter(Boolean));
		const unknown = [
			...new Set(links.filter((link) => link.internal && !known.has(link.key) && knownSections.has(sectionOf(link.key))).map((link) => link.url)),
		];
		if (unknown.length) {
			findings.push({
				severity: 'major',
				code: 'unknown_internal_link',
				source: 'deterministic',
				dimension: 'internal_linking',
				evidence: unknown.slice(0, 6),
				explanation: 'These internal links are not in the destination’s content inventory, so they may be broken or point at unpublished pages.',
				instruction: 'Check each link. Replace it with a published page from the inventory or remove it.',
			});
		}
	}
	for (const name of ctx.promotedNames ?? []) {
		if (!name.trim()) continue;
		const pattern = new RegExp(`\\b${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
		const hits = sectionsOf(ctx.body)
			.map((section) => ({ section: section.heading, count: (plainText(section.body).match(pattern) ?? []).length }))
			.filter((entry) => entry.count > 0);
		const total = hits.reduce((sum, entry) => sum + entry.count, 0);
		if (total >= 4 && hits.length >= 3) {
			findings.push({
				severity: 'major',
				code: 'repeated_product_mention',
				source: 'deterministic',
				dimension: 'brand_voice',
				evidence: [`“${name}” appears ${total} times across ${hits.length} sections: ${listSections(hits.map((entry) => entry.section))}.`],
				explanation: 'Mentioning the same product in most sections reads as promotion and weakens trust in the advice.',
				instruction: `Mention ${name} where it directly helps with the step being described, once or twice in the article.`,
			});
		}
	}
	return findings;
}

/** Overlap with existing articles on the same site: matching titles or keywords, and mirrored section headings. */
export function overlapFindings(ctx: QualityContext): ReviewFinding[] {
	const findings: ReviewFinding[] = [];
	const ownTitle = new Set(contentTerms(`${ctx.title ?? ''} ${ctx.primaryKeyword ?? ''}`));
	const ownHeadings = sectionsOf(ctx.body).map((section) => ({ heading: section.heading, terms: new Set(contentTerms(section.heading)) }));
	for (const other of ctx.related ?? []) {
		const titleScore = jaccard(ownTitle, new Set(contentTerms(`${other.title} ${other.primaryKeyword ?? ''}`)));
		const otherHeadings = other.body ? sectionsOf(other.body).map((section) => ({ heading: section.heading, terms: new Set(contentTerms(section.heading)) })) : [];
		const mirrored = ownHeadings
			.map((own) => {
				const match = otherHeadings.map((item) => ({ item, score: jaccard(own.terms, item.terms) })).sort((a, b) => b.score - a.score)[0];
				return match && match.score >= 0.5 ? `“${own.heading}” ≈ “${match.item.heading}”` : null;
			})
			.filter((item): item is string => Boolean(item));
		const linked = other.url ? ctx.body.includes(other.url) : false;
		if (titleScore >= 0.5 || mirrored.length >= 2) {
			findings.push({
				severity: titleScore >= 0.7 ? 'critical' : 'major',
				code: 'content_overlap',
				source: 'deterministic',
				dimension: 'topic_completeness',
				evidence: [
					`Title and keyword overlap with “${other.title}”: ${Math.round(titleScore * 100)}%.`,
					...(mirrored.length ? [`Section headings that mirror it: ${mirrored.slice(0, 4).join('; ')}.`] : []),
				],
				explanation: 'Two articles that answer the same question compete with each other in search and give readers the same material twice.',
				instruction: `Give this article a distinct job from “${other.title}”: cover what that article does not, and ${linked ? 'keep the single link to it where a reader needs the broader picture' : 'link to it once where a reader needs the broader picture'} instead of repeating its sections.`,
				rejectable: titleScore < 0.7,
			});
		}
	}
	return findings;
}

const PRACTICAL_RE = /\b(for example|for instance|e\.g\.|example:|try this|exercise|worksheet|template|checklist|prompt:|here(’|')s (what|how) (that|this|it) (looks|might look|could look)|sample|worked example|step \d|day \d|session \d)\b/i;

/** Sections that explain without showing the reader what to do. */
export function practicalValueFindings(ctx: QualityContext): ReviewFinding[] {
	const sections = sectionsOf(ctx.body).filter((section) => section.heading !== 'Introduction');
	if (sections.length < 3) return [];
	const thin = sections.filter((section) => {
		const text = section.body;
		const hasList = /^\s*(\d+[.)]|[-*+])\s+/m.test(text) || /^\|/m.test(text);
		return !PRACTICAL_RE.test(plainText(text)) && !hasList && plainText(text).split(/\s+/).length > 150;
	});
	const practical = sections.length - thin.length;
	const howTo = /guide|how[- ]?to|tutorial/i.test(ctx.contentType ?? '');
	if (!thin.length || practical / sections.length > 0.6) return [];
	return [
		{
			severity: howTo ? 'major' : 'minor',
			code: 'thin_practical_value',
			source: 'deterministic',
			dimension: 'topic_completeness',
			section: thin[0].heading,
			evidence: [`Sections without an example, exercise, template or list: ${listSections(thin.map((section) => section.heading))}.`],
			explanation: 'A how-to reader needs to see what the advice looks like in practice. Explanation alone is easy to agree with and hard to act on.',
			instruction: `Add one concrete element to each of these sections, such as a short worked example, a template, a checklist or an exercise the reader can do now. Do not invent statistics or quotations.`,
		},
	];
}

export function runQualityChecks(ctx: QualityContext): ReviewFinding[] {
	return [...repetitionFindings(ctx), ...linkFindings(ctx), ...overlapFindings(ctx), ...practicalValueFindings(ctx)];
}

/** Removes repeat links to one URL, keeping the first `keepFirst`. Anchor text stays as plain words. */
export function unlinkRepeats(body: string, url: string, keepFirst = 1): { body: string; removed: number } {
	const key = normaliseUrl(url);
	let seen = 0;
	let removed = 0;
	const next = body.replace(LINK_RE, (whole, anchor: string, href: string) => {
		if (normaliseUrl(href) !== key) return whole;
		seen += 1;
		if (seen <= keepFirst) return whole;
		removed += 1;
		return anchor;
	});
	return { body: next, removed };
}

export type QualityMetrics = {
	repeatedIdeas: number;
	nearDuplicatePairs: number;
	repeatedLinks: Array<{ url: string; count: number }>;
	externalLinks: number;
	internalLinks: number;
	findings: number;
};

export function qualityMetrics(ctx: QualityContext): QualityMetrics {
	const findings = runQualityChecks(ctx);
	const links = extractLinks(ctx.body, ctx.siteHosts);
	const counts = new Map<string, { url: string; count: number }>();
	for (const link of links) counts.set(link.key, { url: link.url, count: (counts.get(link.key)?.count ?? 0) + 1 });
	const near = findings.find((finding) => finding.code === 'near_duplicate_sentences');
	return {
		repeatedIdeas: findings.filter((finding) => finding.code === 'repeated_idea').length,
		nearDuplicatePairs: near ? Number(/^(\d+)/.exec(near.explanation ?? '')?.[1] ?? 0) : 0,
		repeatedLinks: [...counts.values()].filter((entry) => entry.count > 1).sort((a, b) => b.count - a.count),
		externalLinks: links.filter((link) => !link.internal).length,
		internalLinks: links.filter((link) => link.internal).length,
		findings: findings.length,
	};
}
