import type { ResearchRecord } from '@/lib/agent/types';
import type {
	ArticleRecord,
	ArticleResearch,
	ResearchItemKind,
	ResearchPackage,
	ResearchPackageItem,
	ResearchPackageSource,
	ResearchUpdate,
} from './types';
import { classifySource, evidenceLevel } from './sourceClass';

const STOP = new Set([
	'about', 'after', 'also', 'among', 'and', 'best', 'between', 'cover', 'does', 'each', 'every', 'from', 'guide', 'guides',
	'have', 'help', 'into', 'just', 'make', 'more', 'most', 'other', 'over', 'should', 'some', 'such', 'than', 'that', 'their',
	'them', 'then', 'there', 'these', 'they', 'this', 'tips', 'tricks', 'very', 'what', 'when', 'where', 'which', 'while',
	'with', 'without', 'your', 'yours', 'functional', 'how',
]);

function stem(word: string): string {
	return word.replace(/(ing|ers|er|es|s)$/u, '').replace(/e$/u, '');
}

export function termsFrom(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 3 && !STOP.has(word))
		.map(stem)
		.filter((word) => word.length > 2);
}

/** Terms taken from the brief only. Brand pillars are excluded so brand pages do not score as topic research. */
export function briefTerms(article: Pick<ArticleRecord, 'topic' | 'title' | 'primaryKeyword' | 'workspace'>): Set<string> {
	const brief = article.workspace?.brief;
	return new Set(
		termsFrom(
			[article.topic, article.title, article.primaryKeyword ?? '', brief?.secondaryKeywords ?? '', brief?.questions ?? ''].join(' '),
		),
	);
}

export function relevanceScore(text: string, terms: Set<string>): number {
	if (!terms.size) return 0;
	const words = new Set(termsFrom(text));
	let hits = 0;
	for (const term of terms) if (words.has(term)) hits += 1;
	return Math.min(1, hits / Math.min(terms.size, 4));
}

export function normaliseUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		for (const key of [...parsed.searchParams.keys()]) {
			if (/^(utm_|fbclid|gclid|ref$|si$)/i.test(key)) parsed.searchParams.delete(key);
		}
		const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
		const path = parsed.pathname.replace(/\/+$/, '');
		const query = parsed.searchParams.toString();
		return `${host}${path}${query ? `?${query}` : ''}`;
	} catch {
		return url.trim().toLowerCase();
	}
}

export function normaliseFindingText(text: string): string {
	return text.toLowerCase().replace(/\[[0-9:]+\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cleanFindingText(text: string): string {
	return text
		.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function domainOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

const MIN_RELEVANCE = 0.25;

export function emptyResearchPackage(): ResearchPackage {
	return {
		status: 'empty',
		version: 0,
		updatedAt: null,
		notes: '',
		expertise: '',
		questions: [],
		sources: [],
		items: [],
		gaps: [],
		updates: [],
		approved: null,
	};
}

export function ensureResearchPackage(article: ArticleRecord): ResearchPackage {
	const pkg = article.workspace?.research;
	return pkg ? { ...emptyResearchPackage(), ...pkg } : emptyResearchPackage();
}

function markChanged(pkg: ResearchPackage, update: Omit<ResearchUpdate, 'version' | 'createdAt'>): ResearchUpdate {
	pkg.version += 1;
	pkg.updatedAt = new Date().toISOString();
	pkg.status = pkg.approved ? 'changed_since_approval' : 'draft';
	const entry = { ...update, version: pkg.version, createdAt: pkg.updatedAt };
	pkg.updates = [...pkg.updates, entry];
	return entry;
}

type MergeContext = {
	terms: Set<string>;
	brandDomain: string | null;
	competitorDomains?: string[];
	kind: ResearchUpdate['kind'];
	question: string | null;
};

/**
 * Adds sources and findings from one research run. Sources are deduplicated by normalised URL and findings by
 * normalised text across every earlier version, so repeated runs do not stack copies.
 */
export function mergeResearchRecord(pkg: ResearchPackage, record: ResearchRecord, context: MergeContext): ResearchUpdate {
	const nextVersion = pkg.version + 1;
	const byUrl = new Map(pkg.sources.map((source) => [normaliseUrl(source.url), source]));
	const idMap = new Map<string, string>();
	const rawSources = (record.packet?.sources ?? [])
		.filter((source) => source.url && !source.rejected)
		.map((source) => ({ id: source.id, url: source.url, title: source.title, retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? source.summary ?? '' }));
	const fallbackSources = record.sources
		.filter((source) => source.url)
		.map((source, index) => ({ id: `stored-${index}`, url: source.url as string, title: source.title, retrievedAt: source.retrievedAt, excerpt: source.excerpt ?? '' }));
	let addedSources = 0;
	let excludedSources = 0;
	for (const raw of rawSources.length ? rawSources : fallbackSources) {
		const key = normaliseUrl(raw.url);
		const existing = byUrl.get(key);
		if (existing) {
			idMap.set(raw.id, existing.id);
			continue;
		}
		const domain = domainOf(raw.url);
		const score = relevanceScore(`${raw.title ?? ''} ${raw.excerpt}`, context.terms);
		const brandOwned = Boolean(context.brandDomain && domain.endsWith(context.brandDomain));
		const excluded = !brandOwned && score < MIN_RELEVANCE;
		const source: ResearchPackageSource = {
			id: `src-${nextVersion}-${byUrl.size + 1}`,
			url: raw.url,
			title: cleanFindingText(raw.title || domain || raw.url),
			domain,
			retrievedAt: raw.retrievedAt ?? record.createdAt,
			addedInVersion: nextVersion,
			origin: 'search',
			excluded,
			excludedReason: excluded ? 'Not related to the brief. The title and excerpt do not mention the topic or keywords.' : null,
		};
		source.classification = classifySource(source, { brandDomain: context.brandDomain, competitorDomains: context.competitorDomains });
		if (excluded) excludedSources += 1;
		else addedSources += 1;
		byUrl.set(key, source);
		idMap.set(raw.id, source.id);
		pkg.sources.push(source);
	}
	const seenText = new Set(pkg.items.map((item) => normaliseFindingText(item.text)));
	const sourceById = new Map(pkg.sources.map((source) => [source.id, source]));
	const competitorDomains = new Set((context.competitorDomains ?? []).map((domain) => domain.replace(/^www\./, '')));
	let addedItems = 0;
	const addItem = (text: string, sourceIds: string[], kindHint?: ResearchItemKind) => {
		const clean = cleanFindingText(text);
		const key = normaliseFindingText(clean);
		if (!key || seenText.has(key)) return;
		seenText.add(key);
		const sources = sourceIds.map((id) => sourceById.get(id)).filter((source): source is ResearchPackageSource => Boolean(source));
		const domains = sources.map((source) => source.domain);
		const kind: ResearchItemKind =
			kindHint ??
			(context.brandDomain && domains.some((domain) => domain.endsWith(context.brandDomain as string))
				? 'brand'
				: domains.some((domain) => competitorDomains.has(domain))
					? 'competitor'
					: 'topic');
		const relevance = relevanceScore(clean, context.terms);
		const sourcesExcluded = sources.length > 0 && sources.every((source) => source.excluded);
		const tooShort = clean.length < 40;
		const excluded = sourcesExcluded || tooShort || (kind === 'topic' && relevance === 0 && !sources.some((source) => !source.excluded));
		pkg.items.push({
			id: `item-${nextVersion}-${pkg.items.length + 1}`,
			kind,
			text: clean,
			sourceIds: sources.map((source) => source.id),
			supported: sources.some((source) => !source.excluded),
			relevance,
			addedInVersion: nextVersion,
			excluded,
			excludedReason: sourcesExcluded
				? 'Its only source was excluded as unrelated.'
				: tooShort
					? 'Too short to use as evidence.'
					: excluded
						? 'Not related to the brief.'
						: null,
		});
		if (!excluded) addedItems += 1;
	};
	const packet = record.packet;
	for (const finding of packet?.findings ?? []) addItem(finding.text, finding.sourceIds.map((id) => idMap.get(id) ?? id));
	for (const claim of packet?.claims ?? []) addItem(claim.text, claim.sourceIds.map((id) => idMap.get(id) ?? id));
	if (!packet) {
		for (const claim of record.claims) {
			const source = claim.sourceUrl ? byUrl.get(normaliseUrl(claim.sourceUrl)) : undefined;
			addItem(claim.text, source ? [source.id] : []);
		}
	}
	for (const competitor of packet?.competitors ?? []) {
		if (!competitor.claims.length) continue;
		addItem(`${competitor.name}: ${competitor.claims.join(' ')}`, competitor.sourceIds.map((id) => idMap.get(id) ?? id), 'competitor');
	}
	const gaps = new Set(pkg.gaps);
	for (const gap of packet?.gaps ?? []) gaps.add(gap);
	pkg.gaps = [...gaps].slice(0, 12);
	return markChanged(pkg, {
		kind: context.kind,
		question: context.question,
		researchId: record.id,
		summary: `${addedSources} new source${addedSources === 1 ? '' : 's'}, ${addedItems} new finding${addedItems === 1 ? '' : 's'}${excludedSources ? `, ${excludedSources} unrelated source${excludedSources === 1 ? '' : 's'} excluded` : ''}.`,
	});
}

export function addBrandContext(pkg: ResearchPackage, facts: string[]): void {
	const seen = new Set(pkg.items.map((item) => normaliseFindingText(item.text)));
	for (const fact of facts.slice(0, 6)) {
		const key = normaliseFindingText(fact);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		pkg.items.push({
			id: `brand-${pkg.items.length + 1}`,
			kind: 'brand',
			text: fact.trim(),
			sourceIds: [],
			supported: true,
			relevance: 0,
			addedInVersion: Math.max(pkg.version, 1),
			excluded: false,
			excludedReason: null,
		});
	}
}

export type RelevanceVerdict = { id: string; keep: boolean; kind?: ResearchItemKind; reason?: string; unsupported?: boolean };

export function applyRelevanceVerdicts(pkg: ResearchPackage, verdicts: RelevanceVerdict[], recommendations: string[]): void {
	const byId = new Map(pkg.items.map((item) => [item.id, item]));
	for (const verdict of verdicts) {
		const item = byId.get(verdict.id);
		if (!item || item.kind === 'user') continue;
		if (verdict.kind && verdict.kind !== 'user') item.kind = verdict.kind;
		if (!verdict.keep && !item.excluded) {
			item.excluded = true;
			item.excludedReason = verdict.reason?.trim() || 'Judged not relevant to the brief.';
		}
		if (verdict.unsupported) item.supported = false;
	}
	const seen = new Set(pkg.items.map((item) => normaliseFindingText(item.text)));
	for (const text of recommendations.slice(0, 6)) {
		const key = normaliseFindingText(text);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		pkg.items.push({
			id: `rec-${pkg.version}-${pkg.items.length + 1}`,
			kind: 'recommendation',
			text: text.trim(),
			sourceIds: [],
			supported: true,
			relevance: 1,
			addedInVersion: pkg.version,
			excluded: false,
			excludedReason: null,
		});
	}
}

export function setItemExcluded(pkg: ResearchPackage, itemId: string, excluded: boolean, reason?: string): ResearchUpdate {
	const item = pkg.items.find((entry) => entry.id === itemId);
	const source = item ? null : pkg.sources.find((entry) => entry.id === itemId);
	if (!item && !source) throw new Error('Research item not found.');
	const target = (item ?? source) as ResearchPackageItem | ResearchPackageSource;
	target.excluded = excluded;
	target.excludedReason = excluded ? reason?.trim() || 'Removed by the editor.' : null;
	if (source && excluded) {
		for (const entry of pkg.items) {
			if (entry.sourceIds.includes(source.id)) {
				const live = entry.sourceIds.some((id) => id !== source.id && pkg.sources.find((s) => s.id === id && !s.excluded));
				entry.supported = live || entry.kind === 'user' || entry.kind === 'brand' || entry.kind === 'recommendation';
			}
		}
	}
	return markChanged(pkg, {
		kind: 'manual',
		question: null,
		researchId: null,
		summary: `${excluded ? 'Removed' : 'Restored'} ${item ? 'finding' : 'source'}: ${(item?.text ?? source?.title ?? '').slice(0, 80)}`,
	});
}

export function editItemText(pkg: ResearchPackage, itemId: string, text: string): ResearchUpdate {
	const item = pkg.items.find((entry) => entry.id === itemId);
	if (!item) throw new Error('Research item not found.');
	const clean = text.trim();
	if (!clean) throw new Error('A finding cannot be empty. Remove it instead.');
	item.text = clean;
	return markChanged(pkg, { kind: 'manual', question: null, researchId: null, summary: `Edited finding: ${clean.slice(0, 80)}` });
}

export function addUserSource(pkg: ResearchPackage, input: { url: string; title?: string; note?: string }): ResearchUpdate {
	const key = normaliseUrl(input.url);
	let source = pkg.sources.find((entry) => normaliseUrl(entry.url) === key);
	const nextVersion = pkg.version + 1;
	if (!source) {
		source = {
			id: `src-user-${nextVersion}-${pkg.sources.length + 1}`,
			url: input.url,
			title: input.title?.trim() || domainOf(input.url) || input.url,
			domain: domainOf(input.url),
			retrievedAt: null,
			addedInVersion: nextVersion,
			origin: 'user',
			excluded: false,
			excludedReason: null,
		};
		source.classification = classifySource(source);
		pkg.sources.push(source);
	} else {
		source.excluded = false;
		source.excludedReason = null;
	}
	if (input.note?.trim()) {
		pkg.items.push({
			id: `item-user-${nextVersion}-${pkg.items.length + 1}`,
			kind: 'user',
			text: input.note.trim(),
			sourceIds: [source.id],
			supported: true,
			relevance: 1,
			addedInVersion: nextVersion,
			excluded: false,
			excludedReason: null,
		});
	}
	return markChanged(pkg, { kind: 'manual', question: null, researchId: null, summary: `Added source: ${source.title}` });
}

export function addUserEvidence(pkg: ResearchPackage, text: string): ResearchUpdate {
	const clean = text.trim();
	if (!clean) throw new Error('Add the evidence text.');
	const nextVersion = pkg.version + 1;
	pkg.items.push({
		id: `item-user-${nextVersion}-${pkg.items.length + 1}`,
		kind: 'user',
		text: clean,
		sourceIds: [],
		supported: false,
		relevance: 1,
		addedInVersion: nextVersion,
		excluded: false,
		excludedReason: null,
	});
	return markChanged(pkg, { kind: 'manual', question: null, researchId: null, summary: `Added author evidence: ${clean.slice(0, 80)}` });
}

export function updateNotes(pkg: ResearchPackage, input: { notes?: string; expertise?: string }): ResearchUpdate | null {
	const notesChanged = input.notes !== undefined && input.notes !== pkg.notes;
	const expertiseChanged = input.expertise !== undefined && input.expertise !== pkg.expertise;
	if (!notesChanged && !expertiseChanged) return null;
	if (notesChanged) pkg.notes = input.notes as string;
	if (expertiseChanged) pkg.expertise = input.expertise as string;
	return markChanged(pkg, {
		kind: 'manual',
		question: null,
		researchId: null,
		summary: [notesChanged ? 'Updated research notes' : null, expertiseChanged ? 'Updated author expertise' : null].filter(Boolean).join(' and ') + '.',
	});
}

export function approveResearch(pkg: ResearchPackage): void {
	const live = pkg.items.filter((item) => !item.excluded);
	if (!live.some((item) => item.kind !== 'brand') && !pkg.expertise.trim()) {
		throw new Error('Approve research only when it contains at least one topic finding or author expertise.');
	}
	const now = new Date().toISOString();
	pkg.approved = {
		version: pkg.version,
		approvedAt: now,
		sources: pkg.sources.filter((source) => !source.excluded).map((source) => ({ ...source })),
		items: live.map((item) => ({ ...item })),
		notes: pkg.notes,
		expertise: pkg.expertise,
		questions: [...(pkg.questions ?? [])],
	};
	pkg.status = 'approved';
}

/** Builds the generation input from the approved research snapshot only. */
export function articleResearchFromApproved(pkg: ResearchPackage): ArticleResearch {
	const snapshot = pkg.approved;
	if (!snapshot) throw new Error('Research has not been approved.');
	const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
	const claims: ArticleResearch['claims'] = snapshot.items.map((item) => {
		const source = item.sourceIds.map((id) => sourceById.get(id)).find(Boolean);
		const sourceClass = source ? (source.classification ?? classifySource(source)) : item.kind === 'brand' ? 'brand_knowledge' : undefined;
		return {
			text: item.text,
			sourceLabel: source ? source.title : item.kind === 'brand' ? 'Brand Brain' : item.kind === 'user' ? 'Author' : 'Editorial recommendation',
			confidence: item.kind === 'brand' ? ('stored' as const) : ('supplied' as const),
			sourceUrl: source?.url,
			kind: item.kind,
			sourceClass,
			evidenceLevel: item.kind === 'user' ? 'expert_recommendation' : sourceClass ? evidenceLevel(sourceClass) : undefined,
		};
	});
	if (snapshot.expertise.trim()) {
		claims.push({ text: snapshot.expertise.trim(), sourceLabel: 'Author expertise', confidence: 'supplied', kind: 'user' });
	}
	if (snapshot.notes.trim()) {
		claims.push({ text: snapshot.notes.trim(), sourceLabel: 'Editor research notes', confidence: 'supplied', kind: 'recommendation' });
	}
	const sources: ArticleResearch['sources'] = [
		{ label: 'Brand Brain', kind: 'brand_brain' },
		...snapshot.sources.map((source) => ({ label: source.title, kind: 'supplied' as const, url: source.url, retrievedAt: source.retrievedAt ?? undefined })),
	];
	return {
		sources,
		claims,
		gaps: pkg.gaps,
		usedExternalResearch: snapshot.sources.length > 0,
		packageVersion: snapshot.version,
	};
}

export function researchItemsForStructure(pkg: ResearchPackage): string[] {
	return pkg.items.filter((item) => !item.excluded && item.kind === 'topic' && item.supported).map((item) => item.text);
}
