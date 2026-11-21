export type OptimisationKind = 'metadata' | 'targeted' | 'full';

export type Check = { name: string; pass: boolean; detail: string };

export type MetadataProposal = {
	kind: 'metadata';
	sourceUrl: string;
	originalTitle: string;
	originalDescription: string;
	proposedTitle: string;
	proposedDescription: string;
	evidence: string;
	rationale: string;
	query: string;
};

const SUBJECT_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'how', 'why', 'your']);

function words(value: string): Set<string> {
	return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !SUBJECT_STOP.has(word)));
}

function share(left: string, right: string): number {
	const a = words(left);
	const b = words(right);
	if (!a.size || !b.size) return 0;
	let shared = 0;
	for (const word of a) if (b.has(word)) shared += 1;
	return shared / Math.min(a.size, b.size);
}

export function validateMetadataProposal(input: MetadataProposal, verifiedCapabilities: string[] = []): { pass: boolean; checks: Check[] } {
	const title = input.proposedTitle.trim();
	const description = input.proposedDescription.trim();
	const subject = share(input.originalTitle, title);
	const queryFit = share(input.query, `${title} ${description}`);
	const inventedStat = /\b\d+(?:\.\d+)?%|\b\d{3,}\b/.test(`${title} ${description}`);
	const unsupportedSuperlative = /\b(guaranteed|number one|#1|best tool)\b/i.test(`${title} ${description}`);
	const named = verifiedCapabilities.filter((name) => name.length > 3);
	const claim = named.find((name) => description.toLowerCase().includes(name.toLowerCase()) || title.toLowerCase().includes(name.toLowerCase()));
	const unknownProductClaim = /\b(automatically publishes|replaces the author|writes the whole novel)\b/i.test(`${title} ${description}`);
	const checks: Check[] = [
		{ name: 'query relevance', pass: queryFit >= 0.5, detail: queryFit >= 0.5 ? 'The proposal still uses the query’s subject words.' : 'The proposal does not stay on the query.' },
		{ name: 'search intent', pass: !/\b(buy|pricing|download)\b/i.test(title) || /\b(buy|pricing|download)\b/i.test(input.query), detail: 'The title does not switch the article to a different intent.' },
		{ name: 'factual accuracy', pass: !inventedStat && !unsupportedSuperlative && !unknownProductClaim, detail: inventedStat || unsupportedSuperlative || unknownProductClaim ? 'The proposal adds a claim that is not in the evidence.' : 'No new statistic or unsupported product claim was added.' },
		{ name: 'brand positioning', pass: !unknownProductClaim, detail: claim ? `The proposal names “${claim}”.` : 'The proposal does not add an unverified product claim.' },
		{ name: 'title and description suitability', pass: title.length >= 20 && title.length <= 90 && description.length >= 50 && description.length <= 200, detail: `Title length ${title.length}. Description length ${description.length}.` },
		{ name: 'subject preservation', pass: subject >= 0.5, detail: subject >= 0.5 ? 'The proposed title keeps the article’s subject.' : 'The proposed title changes the article’s subject.' },
	];
	return { pass: checks.every((check) => check.pass), checks };
}

export function validateTargetedImprovement(input: { original: string; revised: string; changedExcerpt: string }): { pass: boolean; checks: Check[] } {
	const originalParts = input.original.split('\n\n');
	const revisedParts = input.revised.split('\n\n');
	const changed = originalParts.filter((part, index) => revisedParts[index] !== part);
	const preserved = originalParts.filter((part, index) => revisedParts[index] === part);
	const checks: Check[] = [
		{ name: 'factual accuracy', pass: !/\b(guaranteed|studies show|\d+(?:\.\d+)?%)\b/i.test(input.changedExcerpt), detail: 'The changed text was checked for unsupported figures and guarantees.' },
		{ name: 'research evidence', pass: input.changedExcerpt.trim().length > 0, detail: 'The change has an identified excerpt.' },
		{ name: 'editorial quality', pass: input.changedExcerpt.trim().length >= 40 && input.changedExcerpt.trim().length <= 1200, detail: 'The change is a limited section, not a replacement article.' },
		{ name: 'surrounding consistency', pass: preserved.length > 0 && changed.length > 0 && changed.length < originalParts.length, detail: `${preserved.length} section${preserved.length === 1 ? '' : 's'} stayed the same.` },
		{ name: 'product claim accuracy', pass: !/\b(automatically publishes|replaces the author)\b/i.test(input.changedExcerpt), detail: 'The changed section does not add an unverified product claim.' },
	];
	return { pass: checks.every((check) => check.pass), checks };
}

export function validateFullRevision(input: { reviewRan: boolean; criticalOpen: number; originalPreserved: boolean }): { pass: boolean; checks: Check[] } {
	const checks: Check[] = [
		{ name: 'editorial review', pass: input.reviewRan, detail: input.reviewRan ? 'The full revision was reviewed.' : 'Full revision still needs editorial review.' },
		{ name: 'critical findings', pass: input.criticalOpen === 0, detail: input.criticalOpen === 0 ? 'No critical findings are open.' : `${input.criticalOpen} critical findings remain.` },
		{ name: 'original preserved', pass: input.originalPreserved, detail: 'The published article was not overwritten.' },
	];
	return { pass: checks.every((check) => check.pass), checks };
}

export function metadataApprovalDecision(validation: { pass: boolean }): 'queue' | 'blocked' {
	return validation.pass ? 'queue' : 'blocked';
}

export function addStageCost(current: number, stageCost: number | null | undefined): { costUsd: number; missing: boolean } {
	if (typeof stageCost !== 'number') return { costUsd: current, missing: true };
	return { costUsd: Math.round((current + stageCost) * 1_000_000) / 1_000_000, missing: false };
}

export function isMetadataProposalDocument(body: string): boolean {
	return body.trimStart().startsWith('# Metadata proposal');
}

export function parseMetadataProposal(body: string): MetadataProposal | null {
	const read = (label: string) => body.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? '';
	const proposedTitle = read('Proposed title') || body.match(/^## Suggested title\s*\n+(.+)$/m)?.[1]?.trim() || '';
	const proposedDescription = read('Proposed description') || body.match(/^## Suggested description\s*\n+(.+)$/m)?.[1]?.trim() || '';
	if (!proposedTitle || !proposedDescription) return null;
	return {
		kind: 'metadata',
		sourceUrl: read('Source'),
		originalTitle: read('Original title'),
		originalDescription: read('Original description'),
		proposedTitle,
		proposedDescription,
		evidence: read('Evidence'),
		rationale: (body.match(/^## Why\s*\n([\s\S]*)$/m)?.[1] ?? read('Rationale')).trim(),
		query: read('Query') || read('Source').split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || '',
	};
}

export function renderMetadataProposal(input: MetadataProposal & { checks: Check[]; approvalStatus: 'pending' | 'blocked' }): string {
	return [
		'# Metadata proposal',
		`Source: ${input.sourceUrl}`,
		`Query: ${input.query}`,
		`Original title: ${input.originalTitle}`,
		`Original description: ${input.originalDescription}`,
		`Proposed title: ${input.proposedTitle}`,
		`Proposed description: ${input.proposedDescription}`,
		`Evidence: ${input.evidence}`,
		`Approval status: ${input.approvalStatus}`,
		'',
		'## Why',
		input.rationale,
		'',
		'## Checks',
		...input.checks.map((check) => `- ${check.name}: ${check.pass ? 'pass' : 'fail'}. ${check.detail}`),
		'',
		'This proposal does not change the published article.',
	].join('\n');
}
