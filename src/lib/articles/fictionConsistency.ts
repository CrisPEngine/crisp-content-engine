export type FictionKind = 'accidental' | 'intentional' | 'uncertain';

export type FictionIssue = {
	kind: FictionKind;
	message: string;
	evidence: string[];
};

const TEACHING = /conflicts are visible|these are separate problems|continuity error|deliberate|illustrative|for this example|suppose|teaching/i;

function names(body: string): string[] {
	const found = new Set<string>();
	for (const match of body.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
		const name = match[0] ?? '';
		if (!/^(The|This|That|Chapter|When|After|Before|Suppose|Ask|Start|Place|Your|For|Here|Now|These|Table|Entity|Story|Bible|Island|Mainland|Lunar|Crew)$/.test(name)) found.add(name);
	}
	return [...found];
}

function nearDuplicate(a: string, b: string): boolean {
	if (Math.abs(a.length - b.length) > 1) return false;
	let edits = 0;
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) if (a[index] !== b[index]) edits += 1;
	return edits === 1;
}

/** Classifies fictional clashes. A contradiction the article explains as a lesson is not an accidental writing error. */
export function classifyFictionalConsistency(body: string): FictionIssue[] {
	const issues: FictionIssue[] = [];
	const teaching = TEACHING.test(body);
	const list = names(body);
	for (let i = 0; i < list.length; i += 1) {
		for (let j = i + 1; j < list.length; j += 1) {
			const a = list[i] ?? '';
			const b = list[j] ?? '';
			if (!nearDuplicate(a, b)) continue;
			issues.push({
				kind: 'accidental',
				message: `${a} and ${b} look like the same name spelled two ways.`,
				evidence: [a, b],
			});
		}
	}
	const lunar = /lunar|rover|outpost/i.test(body);
	const island = /ferry|island archive|mainland quay/i.test(body);
	if (lunar && island) {
		issues.push({
			kind: teaching ? 'intentional' : 'accidental',
			message: teaching
				? 'An island-ferry scene is present beside the lunar example and is framed as a lesson.'
				: 'The draft mixes a lunar setting with an unrelated island-ferry setting.',
			evidence: ['lunar setting', 'island or ferry setting'],
		});
	}
	const explainedClash = /cannot (walk|grip)|arrives? before|before (their|the) journey|unintroduced/i.test(body) && teaching;
	if (explainedClash) {
		issues.push({
			kind: 'intentional',
			message: 'A character or timeline clash is presented as a continuity error for the reader to find.',
			evidence: ['The surrounding text explains the clash as a continuity problem.'],
		});
	}
	return issues;
}
