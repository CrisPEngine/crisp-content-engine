import { describe, expect, it } from 'vitest';
import { assembleSections } from '../structure';
import {
	appendContinuation,
	canResumeGeneration,
	completedSectionMap,
	generationPausedMessage,
	sectionOutputBudget,
	type GenerationCheckpoint,
} from '../generationCheckpoint';

const paragraph = 'Choose one idea, write the scene that proves it, and leave the other ideas in a list for later.';

function checkpoint(sections: GenerationCheckpoint['sections']): GenerationCheckpoint {
	return {
		jobId: 'job-1',
		outline: [
			{ id: 's1', heading: 'Start with the scene', purpose: 'Show the test', targetWords: 180 },
			{ id: 's2', heading: 'Stop comparing', purpose: 'Close the loop', targetWords: 180 },
		],
		sections,
		updatedAt: '2026-11-26T12:00:00.000Z',
	};
}

describe('article generation reliability', () => {
	it('sizes each section below the role ceiling', () => {
		expect(sectionOutputBudget(180, 16384)).toBeLessThan(16384);
		expect(sectionOutputBudget(180, 16384)).toBeGreaterThan(800);
		expect(sectionOutputBudget(4000, 16384)).toBe(16384);
	});

	it('joins a continuation without repeating the overlapping ending', () => {
		const ending = 'The last clause of this section is long enough to detect.';
		const merged = appendContinuation(`${paragraph} ${ending}`, `${ending} finishes the point.`);
		expect(merged.match(/The last clause of this section is long enough to detect/g)).toHaveLength(1);
		expect(merged.endsWith('finishes the point.')).toBe(true);
	});

	it('keeps a continuation that does not overlap', () => {
		expect(appendContinuation(paragraph, 'A new paragraph follows.')).toBe(`${paragraph}\n\nA new paragraph follows.`);
	});

	it('resumes only saved sections and ignores an existing draft', () => {
		const saved = checkpoint([{ id: 's1', heading: 'Start with the scene', status: 'complete', body: paragraph, attempts: 1, error: null, model: 'gpt-6.1-sol', updatedAt: '2026-11-26T12:00:00.000Z' }]);
		expect(canResumeGeneration('', saved)?.outline).toHaveLength(2);
		expect(canResumeGeneration('Existing approved draft.', saved)).toBeNull();
		expect([...completedSectionMap(saved).keys()]).toEqual(['s1']);
	});

	it('does not treat a failed section body as saved progress', () => {
		const saved = checkpoint([{ id: 's2', heading: 'Stop comparing', status: 'failed', body: 'and', attempts: 3, error: 'interrupted', model: 'gpt-6.1-sol', updatedAt: '2026-11-26T12:00:00.000Z' }]);
		expect(completedSectionMap(saved).size).toBe(0);
		expect(canResumeGeneration('', saved)).toBeNull();
	});

	it('explains a paused generation without the token error', () => {
		const saved = checkpoint([{ id: 's1', heading: 'Start with the scene', status: 'complete', body: paragraph, attempts: 1, error: null, model: 'gpt-6.1-sol', updatedAt: '2026-11-26T12:00:00.000Z' }]);
		expect(generationPausedMessage(saved, 'Long-form draft was truncated by the model and cannot be saved.')).toBe(
			'Generation paused. 1 of 2 sections are saved. Resume generation to continue.',
		);
	});

	it('assembles sections in outline order without duplicating a paragraph', () => {
		const markdown = assembleSections([
			{ heading: 'Start with the scene', body: paragraph },
			{ heading: 'Stop comparing', body: 'Compare the idea with the scene, then decide.' },
		]);
		expect(markdown.indexOf('## Start with the scene')).toBeLessThan(markdown.indexOf('## Stop comparing'));
		expect(markdown.match(/Choose one idea/g)).toHaveLength(1);
		expect(markdown).toContain('## Stop comparing');
	});

	it('reproduces the six-section failure as saved progress plus one unfinished section', () => {
		const sections = Array.from({ length: 5 }, (_, index) => ({
			id: `s${index + 1}`,
			heading: `Section ${index + 1}`,
			status: 'complete' as const,
			body: `Section ${index + 1} ends with a complete point about choosing the idea.`,
			attempts: 1,
			error: null,
			model: 'gpt-6.1-sol',
			updatedAt: '2026-11-26T08:13:00.000Z',
		}));
		const saved = checkpoint(sections);
		saved.outline = sections.map((section) => ({ id: section.id, heading: section.heading, purpose: section.heading, targetWords: 400 }));
		saved.outline.push({ id: 's6', heading: 'Section 6', purpose: 'Close', targetWords: 400 });
		const resumed = canResumeGeneration('', saved);
		const pending = resumed?.outline.filter((item) => !completedSectionMap(resumed).has(item.id)) ?? [];
		expect(completedSectionMap(saved).size).toBe(5);
		expect(pending.map((item) => item.id)).toEqual(['s6']);
		const assembled = assembleSections(sections.map((section) => ({ heading: section.heading, body: section.body })));
		expect(assembled.match(/^## /gm)).toHaveLength(5);
		expect(assembled).not.toContain('## Section 6');
	});
});
