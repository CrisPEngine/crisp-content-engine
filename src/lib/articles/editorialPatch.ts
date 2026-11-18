import { classifyFictionalConsistency } from './fictionConsistency';
import { validateArticleStructure } from './structure';

export type EditorialPatch = {
	revisionId: string;
	section: string | null;
	original: string;
	replacement: string;
	findingCode: string;
	expectedImprovement: string;
	verifiedClaims?: string[];
	verifiedFacts?: string[];
};

export type PatchDecision = { ok: true; body: string } | { ok: false; reason: string };

const LEAK = /\breason:\s|\binstruction:\s|do not paraphrase|model calls:|accepted proposals/i;
const UNSUPPORTED_PRODUCT = /desktop|generates (the|your)|one-click|private studio|automatically (writes|publishes)/i;

function sectionSlice(body: string, heading: string): string | null {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'm').exec(body);
	if (!match) return null;
	const rest = body.slice(match.index);
	const next = rest.slice(1).search(/^##\s+/m);
	return next < 0 ? rest : rest.slice(0, next + 1);
}

function newCalendarPhrases(original: string, replacement: string): string[] {
	const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
	const pattern = new RegExp(`\\b\\d{1,2}\\s+(?:${months})\\b`, 'gi');
	const found = [...replacement.matchAll(pattern)].map((match) => match[0].toLowerCase());
	return found.filter((phrase) => !original.toLowerCase().includes(phrase));
}

export function validateEditorialPatch(body: string, currentRevisionId: string, patch: EditorialPatch): PatchDecision {
	const original = patch.original.replace(/\r\n/g, '\n');
	const replacement = patch.replacement.replace(/\r\n/g, '\n');
	if (patch.revisionId !== currentRevisionId) return { ok: false, reason: 'The patch targets a stale revision.' };
	if (!original.trim()) return { ok: false, reason: 'The patch has no original text.' };
	const occurrences = body.split(original).length - 1;
	if (occurrences !== 1) return { ok: false, reason: occurrences === 0 ? 'The original text is not in this revision.' : 'The original text appears more than once.' };
	if (patch.section) {
		const section = sectionSlice(body, patch.section);
		if (!section || !section.includes(original)) return { ok: false, reason: 'The original text is outside the named section.' };
	}
	if (LEAK.test(replacement)) return { ok: false, reason: 'The replacement contains editorial instructions.' };
	if (replacement.length > Math.max(2000, original.length * 4 + 500)) return { ok: false, reason: 'The replacement rewrites more than the targeted passage.' };
	const claims = patch.verifiedClaims ?? [];
	for (const sentence of replacement.split(/(?<=[.!?])\s+/)) {
		if (!/Folian|Story Bible|AI-assisted/i.test(sentence) || original.includes(sentence)) continue;
		if (UNSUPPORTED_PRODUCT.test(sentence) || !claims.some((claim) => claim.length >= 30 && sentence.includes(claim))) {
			return { ok: false, reason: 'The replacement adds a product claim that is not in the approved research.' };
		}
	}
	const facts = (patch.verifiedFacts ?? []).map((fact) => fact.toLowerCase());
	const unknownDate = newCalendarPhrases(original, replacement).find((phrase) => !facts.some((fact) => fact.includes(phrase)));
	if (unknownDate) return { ok: false, reason: `The replacement introduces an unverified date: ${unknownDate}.` };
	if (/\]\(https?:/i.test(original) && !/\]\(https?:/i.test(replacement)) return { ok: false, reason: 'The replacement removes a source link.' };
	const next = body.replace(original, replacement);
	const structure = validateArticleStructure(next);
	if (!structure.ok) return { ok: false, reason: 'The patched article fails structure validation.' };
	const before = classifyFictionalConsistency(body).filter((issue) => issue.kind === 'accidental').length;
	const after = classifyFictionalConsistency(next).filter((issue) => issue.kind === 'accidental').length;
	if (after > before) return { ok: false, reason: 'The patch introduces a fictional continuity conflict.' };
	return { ok: true, body: next };
}
