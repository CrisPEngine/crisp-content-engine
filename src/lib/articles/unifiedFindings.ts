export type UnifiedFinding = {
	id: string;
	title: string;
	severity: 'critical' | 'major' | 'minor';
	source: string;
	section: string | null;
	explanation: string;
	evidence: string[];
	correction: string;
	status: string;
	stale: boolean;
	historyNote?: string | null;
	appliedRevisionNumber?: number | null;
};

function tokens(value: string): Set<string> {
	return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 3));
}

function similar(a: string, b: string): boolean {
	const left = tokens(a);
	const right = tokens(b);
	if (!left.size || !right.size) return false;
	let shared = 0;
	for (const token of left) if (right.has(token)) shared += 1;
	return shared / (left.size + right.size - shared) >= 0.45;
}

const SOURCE_LABEL: Record<string, string> = {
	deterministic: 'Deterministic structural validation',
	llm: 'AI editorial critique',
	critique: 'AI editorial critique',
	research: 'Research and source validation',
	product: 'Product capability validation',
	seo: 'SEO validation',
	cms: 'CMS compatibility validation',
};

export function sourceLabel(source: string, category?: string): string {
	if (category === 'research') return SOURCE_LABEL.research;
	if (category === 'product' || category === 'brand') return SOURCE_LABEL.product;
	if (category === 'seo') return SOURCE_LABEL.seo;
	if (category === 'cms') return SOURCE_LABEL.cms;
	return SOURCE_LABEL[source] ?? source;
}

/** One list. Findings about the same passage and the same action keep the stronger item and both evidence notes. */
export function consolidateFindings(items: UnifiedFinding[]): UnifiedFinding[] {
	const kept: UnifiedFinding[] = [];
	for (const item of items) {
		const match = kept.find((existing) => (existing.section ?? '') === (item.section ?? '') && similar(existing.correction, item.correction));
		if (!match) {
			kept.push({ ...item, evidence: [...item.evidence] });
			continue;
		}
		const rank = { critical: 0, major: 1, minor: 2 };
		if (rank[item.severity] < rank[match.severity]) {
			match.severity = item.severity;
			match.title = item.title;
			match.explanation = item.explanation;
		}
		for (const note of item.evidence) if (!match.evidence.includes(note)) match.evidence.push(note);
		if (!match.source.includes(item.source)) match.source = `${match.source}; ${item.source}`;
		if (item.historyNote && !match.historyNote) match.historyNote = item.historyNote;
	}
	return kept.sort((a, b) => ({ critical: 0, major: 1, minor: 2 })[a.severity] - ({ critical: 0, major: 1, minor: 2 })[b.severity]);
}
