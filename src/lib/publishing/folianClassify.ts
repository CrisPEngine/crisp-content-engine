export const FOLIAN_CATEGORIES = [
	'writing-a-book',
	'craft',
	'planning-continuity',
	'editing',
	'publishing',
	'book-marketing',
	'tools-ai',
] as const;

export type FolianCategory = (typeof FOLIAN_CATEGORIES)[number];

const RULES: Array<{ category: FolianCategory; needles: string[] }> = [
	{ category: 'tools-ai', needles: ['chatgpt', 'claude', 'ai writing', 'prompt'] },
	{ category: 'book-marketing', needles: ['launch', 'amazon', 'newsletter', 'discoverability'] },
	{ category: 'publishing', needles: ['isbn', 'self-publishing', 'traditional', 'kdp'] },
	{ category: 'editing', needles: ['revision', 'proofread', 'line edit', 'beta reader'] },
	{ category: 'planning-continuity', needles: ['story bible', 'continuity', 'canon', 'timeline', 'series'] },
	{ category: 'craft', needles: ['scene', 'dialogue', 'point of view', 'pacing', 'pov'] },
	{ category: 'writing-a-book', needles: ['novel', 'first draft', 'outline', 'word count', 'premise'] },
];

export function classifyFolianTopic(topic: string, searchIntent = ''): {
	category: FolianCategory;
	contentType: 'guide' | 'pillar';
	pillar: boolean;
	tags: string[];
	toolSlugs: string[];
} {
	const haystack = `${topic} ${searchIntent}`.toLowerCase();
	const match = RULES.find((rule) => rule.needles.some((needle) => haystack.includes(needle)));
	const category = match?.category ?? 'writing-a-book';
	if (!FOLIAN_CATEGORIES.includes(category)) {
		throw new Error(`Unknown Folian category: ${category}`);
	}
	const pillar = /how to write a novel|from idea to first draft/.test(haystack);
	const tags = [pillar ? 'pillar' : 'supporting', 'needs-review'];
	const toolSlugs = /word count|first draft|novel|schedule/.test(haystack) ? ['word-count-planner'] : [];
	return { category, contentType: pillar ? 'pillar' : 'guide', pillar, tags, toolSlugs };
}

export function assertFolianCategory(value: string): FolianCategory {
	if ((FOLIAN_CATEGORIES as readonly string[]).includes(value)) return value as FolianCategory;
	throw new Error(`Unknown Folian category: ${value}`);
}
