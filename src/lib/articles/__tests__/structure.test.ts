import { describe, expect, it } from 'vitest';
import {
	articleWordCount,
	assembleSections,
	cleanSectionBody,
	diffParagraphs,
	excerptFrom,
	parseSections,
	validateArticleStructure,
} from '../structure';

const MODEL_SECTION = '## 1. Turn your idea into a premise\n\nA premise names the character, the want and the obstacle. Write it in one sentence.';

describe('article structure', () => {
	it('removes the heading a section model repeats, so assembly emits each H2 once', () => {
		const body = assembleSections([
			{ heading: '1. Turn your idea into a premise', body: MODEL_SECTION },
			{ heading: '2. Plan the middle', body: '**2. Plan the middle**\n\nList the turns before you draft. Then draft.' },
		]);
		expect(body.match(/^## 1\. Turn your idea into a premise$/gm)).toHaveLength(1);
		expect(body.match(/^## 2\. Plan the middle$/gm)).toHaveLength(1);
		expect(body).not.toContain('**2. Plan the middle**');
		expect(validateArticleStructure(body).ok).toBe(true);
	});

	it('demotes stray H2 inside a section so it cannot collide with section headings', () => {
		expect(cleanSectionBody('Intro sentence.\n\n## A sub-step\n\nDetail.', 'Section')).toContain('### A sub-step');
	});

	it('rejects duplicate adjacent headings as critical', () => {
		const report = validateArticleStructure('## Plan\n\n## Plan\n\nA complete paragraph.');
		expect(report.ok).toBe(false);
		expect(report.issues.map((issue) => issue.code)).toContain('duplicate_adjacent_heading');
	});

	it('rejects the same H2 used twice', () => {
		const report = validateArticleStructure('## Plan\n\nOne.\n\n## Draft\n\nTwo.\n\n## Plan\n\nThree.');
		expect(report.issues.map((issue) => issue.code)).toContain('duplicate_heading');
	});

	it('detects a truncated ending and accepts a clean one', () => {
		expect(validateArticleStructure('## Close\n\nThen write tha').issues.map((issue) => issue.code)).toContain('truncated_ending');
		expect(validateArticleStructure('## Close\n\nThen write that scene.').ok).toBe(true);
		expect(validateArticleStructure('## Close\n\n- Finish the draft.\n- Rest, then revise.').ok).toBe(true);
		expect(validateArticleStructure('Body.\n\n## Final heading').issues.map((issue) => issue.code)).toContain('ends_with_heading');
	});

	it('counts words in plain text and builds an excerpt without markdown', () => {
		const body = '## Start here\n\nA premise names the **character** and the [want](https://example.com/want). It also names the obstacle.';
		expect(articleWordCount(body)).toBe(15);
		const excerpt = excerptFrom(body);
		expect(excerpt.startsWith('#')).toBe(false);
		expect(excerpt).toContain('A premise names the character and the want.');
	});

	it('parses sections back from the body', () => {
		const sections = parseSections('Intro.\n\n## One\n\nFirst.\n\n### Sub\n\nMore.\n\n## Two\n\nSecond.');
		expect(sections.map((section) => section.heading)).toEqual(['', 'One', 'Two']);
		expect(sections[1].body).toContain('### Sub');
	});

	it('diffs paragraphs for before and after review', () => {
		const parts = diffParagraphs('A.\n\nB.\n\nC.', 'A.\n\nB2.\n\nC.');
		expect(parts.filter((part) => part.type === 'removed').map((part) => part.text)).toEqual(['B.']);
		expect(parts.filter((part) => part.type === 'added').map((part) => part.text)).toEqual(['B2.']);
	});
});
