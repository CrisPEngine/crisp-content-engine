import type { ProsePatternHit } from '../types';

type Detector = {
	id: string;
	label: string;
	severity: ProsePatternHit['severity'];
	test: (text: string) => string[];
};

const CLICHE_AI = [
	'in today\'s fast-paced',
	'in the ever-evolving',
	'unlock the power',
	'delve into',
	'landscape is changing',
	'game-changer',
	'leverage',
	'synergy',
	'it\'s not just about',
	'at the end of the day',
	'here\'s the thing',
	'let that sink in',
	'and that\'s okay',
	'i\'ll wait',
	'hot take',
	'unpopular opinion',
	'the future of',
	'reimagine',
	'elevate your',
];

const TRANSITIONS = ['that said', 'with that in mind', 'at the same time', 'on the other hand', 'in other words'];

function sentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function countMatches(text: string, pattern: RegExp): string[] {
	return [...text.matchAll(pattern)].map((match) => match[0]).slice(0, 5);
}

const DETECTORS: Detector[] = [
	{
		id: 'generic_scene_setting',
		label: 'Generic scene-setting introduction',
		severity: 'high',
		test: (text) =>
			/^(in today'?s|in a world where|in the ever-|we live in a time)/im.test(text.trim())
				? [sentences(text)[0] ?? '']
				: [],
	},
	{
		id: 'predictable_marketing',
		label: 'Predictable marketing language',
		severity: 'medium',
		test: (text) => CLICHE_AI.filter((phrase) => text.toLowerCase().includes(phrase)),
	},
	{
		id: 'rhetorical_questions',
		label: 'Excessive rhetorical questions',
		severity: 'medium',
		test: (text) => {
			const questions = sentences(text).filter((sentence) => sentence.includes('?'));
			return questions.length >= 3 ? questions.slice(0, 4) : [];
		},
	},
	{
		id: 'parallel_construction',
		label: 'Excessive parallel construction',
		severity: 'low',
		test: (text) => {
			const we = sentences(text).filter((sentence) => /^we\s/i.test(sentence));
			return we.length >= 4 ? we.slice(0, 3) : [];
		},
	},
	{
		id: 'triplets',
		label: 'Excessive triplets',
		severity: 'low',
		test: (text) => countMatches(text, /\b[\w'-]+,\s+[\w'-]+,\s+(and|&)\s+[\w'-]+\b/gi).slice(0, 4),
	},
	{
		id: 'not_x_but_y',
		label: 'Overuse of “not X, but Y”',
		severity: 'medium',
		test: (text) => {
			const hits = countMatches(text, /\bit'?s not\b[^.]{0,60}\bbut\b/gi);
			return hits.length >= 2 ? hits : [];
		},
	},
	{
		id: 'fake_conversational_hook',
		label: 'Fake conversational hook',
		severity: 'high',
		test: (text) =>
			/^(so[,.]?\s+|look[,.]?\s+|okay[,.]?\s+|here'?s the (kicker|deal|truth))/im.test(text.trim())
				? [sentences(text)[0] ?? '']
				: [],
	},
	{
		id: 'forced_profundity',
		label: 'Forced profundity',
		severity: 'medium',
		test: (text) =>
			countMatches(text, /\b(the real (question|work|shift) is|what if the (real|true)|perhaps the most)\b/gi),
	},
	{
		id: 'formulaic_linkedin',
		label: 'Formulaic LinkedIn structure',
		severity: 'medium',
		test: (text) => {
			const hasHookBreaks = (text.match(/^[A-Z][^\n]{0,80}$/gm) || []).length >= 5;
			const hasCta = /comment\s+(below|if)|agree\?/i.test(text);
			const hasNumbered = /^\d+[\).]/m.test(text);
			return hasHookBreaks && hasCta && hasNumbered ? ['Short-line hook + numbered list + engagement CTA'] : [];
		},
	},
	{
		id: 'summary_conclusion',
		label: 'Unnecessary summary conclusion',
		severity: 'medium',
		test: (text) => {
			const last = sentences(text).slice(-2).join(' ');
			return /\bin (conclusion|summary)|to (sum up|recap)|the (key )?takeaway is/i.test(last) ? [last] : [];
		},
	},
	{
		id: 'transition_phrases',
		label: 'Repeated transition phrases',
		severity: 'low',
		test: (text) => TRANSITIONS.filter((phrase) => (text.toLowerCase().match(new RegExp(phrase, 'g')) || []).length >= 2),
	},
	{
		id: 'qualification',
		label: 'Excessive qualification',
		severity: 'low',
		test: (text) => {
			const hits = countMatches(text, /\b(might|perhaps|sort of|kind of|it could be argued)\b/gi);
			return hits.length >= 6 ? hits.slice(0, 4) : [];
		},
	},
	{
		id: 'sectioning',
		label: 'Excessive sectioning',
		severity: 'low',
		test: (text) => {
			const headings = (text.match(/^#{1,3}\s+.+$/gm) || []).length;
			return headings >= 5 ? [`${headings} markdown headings`] : [];
		},
	},
	{
		id: 'repeated_idea',
		label: 'Restating the same idea several ways',
		severity: 'medium',
		test: (text) => {
			const parts = sentences(text);
			const dupes: string[] = [];
			for (let i = 1; i < parts.length; i += 1) {
				const prev = parts[i - 1].toLowerCase().split(/\W+/).filter((token) => token.length > 4);
				const curr = new Set(parts[i].toLowerCase().split(/\W+/).filter((token) => token.length > 4));
				const overlap = prev.filter((token) => curr.has(token)).length;
				if (prev.length > 3 && overlap / prev.length > 0.6) dupes.push(parts[i]);
			}
			return dupes.slice(0, 3);
		},
	},
];

export function detectProsePatterns(text: string): ProsePatternHit[] {
	return DETECTORS.map((detector) => {
		const examples = detector.test(text).filter(Boolean);
		return {
			id: detector.id,
			label: detector.label,
			severity: detector.severity,
			count: examples.length,
			examples,
		};
	}).filter((hit) => hit.count > 0);
}

export function proseScoreFromHits(hits: ProsePatternHit[]): number {
	if (hits.length === 0) return 0.92;
	const penalty = hits.reduce((sum, hit) => {
		const weight = hit.severity === 'high' ? 0.12 : hit.severity === 'medium' ? 0.07 : 0.03;
		return sum + weight * Math.min(hit.count, 3);
	}, 0);
	return Math.max(0.2, Math.round((0.92 - penalty) * 100) / 100);
}

export function shouldRewrite(hits: ProsePatternHit[]): boolean {
	const high = hits.filter((hit) => hit.severity === 'high').length;
	const medium = hits.filter((hit) => hit.severity === 'medium').length;
	return high >= 1 || medium >= 3 || hits.length >= 5;
}
