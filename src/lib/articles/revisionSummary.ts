import { diffParagraphs } from '@/lib/articles/structure';

export type RevisionChangeSummary = {
	previousWords: number;
	nextWords: number;
	added: number;
	removed: number;
	bullets: string[];
	addedSnippets: string[];
};

function lead(text: string): string {
	const clean = text.replace(/[#>*|[\]_`]/g, ' ').replace(/\s+/g, ' ').trim();
	const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
	return sentence.length > 140 ? `${sentence.slice(0, 137).trim()}…` : sentence;
}

/** Describes a saved revision from the two bodies. It does not repeat the editor's instructions. */
export function summariseRevisionChange(before: string, after: string): RevisionChangeSummary {
	const parts = diffParagraphs(before, after);
	const added = parts.filter((part) => part.type === 'added');
	const removed = parts.filter((part) => part.type === 'removed');
	const bullets = [...new Set(added.map((part) => part.text.includes('|') ? 'A table in the example was updated.' : lead(part.text)))]
		.filter((line) => line.length > 24)
		.slice(0, 4);
	return {
		previousWords: before.trim().split(/\s+/).filter(Boolean).length,
		nextWords: after.trim().split(/\s+/).filter(Boolean).length,
		added: added.length,
		removed: removed.length,
		bullets: bullets.length ? bullets : ['The saved paragraphs match the previous revision.'],
		addedSnippets: added.map((part) => part.text.replace(/\s+/g, ' ').trim().slice(0, 80)).filter((line) => line.length > 16),
	};
}
