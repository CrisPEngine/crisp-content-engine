import { describe, expect, it } from 'vitest';
import { critiqueDraft } from '@/lib/articles/editorialDesk';
import { classifyFictionalConsistency } from '@/lib/articles/fictionConsistency';
import { conceptRelevanceWarning, suggestImageConcept, suggestImageConcepts } from '@/lib/articles/imageBrief';
import { summariseRevisionChange } from '@/lib/articles/revisionSummary';
import { consolidateFindings } from '@/lib/articles/unifiedFindings';

describe('editorial sprint', () => {
	it('treats an explained continuity mistake as a lesson and a name clash as accidental', () => {
		const ordinary = classifyFictionalConsistency('Mark the next chapter. Record the change. Character names stay in the table. Mara reaches the outpost.');
		expect(ordinary.some((item) => /Mark|Record|Character/.test(item.message))).toBe(false);
		const taught = classifyFictionalConsistency('Mara reaches the lunar outpost before the rover journey finishes. These conflicts are visible. The ferry example is only there to show the mistake.');
		expect(taught.some((item) => item.kind === 'intentional')).toBe(true);
		const mixed = classifyFictionalConsistency('The lunar crew meets at the island archive and boards the ferry. Sela Ortiz and Sena Ortiz share the scene.');
		expect(mixed.some((item) => item.kind === 'accidental' && /Sela/.test(item.message))).toBe(true);
		expect(mixed.some((item) => item.kind === 'accidental' && /island/.test(item.message))).toBe(true);
	});

	it('does not ask a short definition article for a guide introduction', () => {
		const critique = critiqueDraft({
			title: 'What is a story bible',
			topic: 'story bible definition',
			body: 'A story bible is a record of facts.',
			targetWords: 400,
		});
		expect(critique.findings.some((item) => item.id === 'intro-weak')).toBe(false);
	});

	it('summarises a saved revision from the paragraphs that actually changed', () => {
		const summary = summariseRevisionChange('Mara takes the ferry to the island archive.\n\nThe end.', 'Mara checks the lunar timeline before the rover departs.\n\nThe end.');
		expect(summary.added).toBe(1);
		expect(summary.bullets[0]).toMatch(/lunar timeline/);
		expect(summary.bullets.join(' ')).not.toMatch(/instruction/i);
	});

	it('keeps one finding when two engines recommend the same correction', () => {
		const merged = consolidateFindings([
			{ id: 'a', title: 'Examples', severity: 'major', source: 'AI editorial critique', section: 'Open', explanation: 'Names differ.', evidence: ['Sela'], correction: 'Use one spelling for the crew member throughout the example.', status: 'open', stale: false },
			{ id: 'b', title: 'Names', severity: 'critical', source: 'Deterministic structural validation', section: 'Open', explanation: 'The same person has two spellings.', evidence: ['Sena'], correction: 'Use one spelling for the crew member throughout the example.', status: 'open', stale: false },
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.severity).toBe('critical');
		expect(merged[0]?.evidence).toEqual(['Sela', 'Sena']);
	});

	it('gives a continuity article a different concept from a first-page article', () => {
		const start = suggestImageConcept({ role: 'hero', title: 'How to Start Writing a Book', topic: 'how to start writing a book' });
		const continuity = suggestImageConcepts({ role: 'hero', title: 'How to Prevent Continuity Errors in a Novel', topic: 'novel continuity errors' });
		expect(start.toLowerCase()).toMatch(/café|cafe/);
		expect(continuity.map((item) => item.title)).toEqual(['Editorial desk', 'Story chronology', 'Character consistency']);
		expect(continuity.some((item) => /café|cafe/i.test(item.description) && /beginning a book/i.test(item.description))).toBe(false);
		expect(conceptRelevanceWarning(start, 'How to Prevent Continuity Errors', 'continuity errors')).toMatch(/café|cafe|beginning/i);
	});
});