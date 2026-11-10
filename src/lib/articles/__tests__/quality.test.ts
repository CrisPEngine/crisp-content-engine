import { describe, expect, it } from 'vitest';
import { extractLinks, runQualityChecks } from '../quality';

describe('quality findings', () => {
	it('flags repeated Word Count Planner and novel-guide links', () => {
		const body = [
			'## Start',
			'',
			'Use the [Word Count Planner](https://folian.app/tools/word-count-planner) today.',
			'',
			'## Continue',
			'',
			'Later, read [How to Write a Novel](https://folian.app/articles/how-to-write-a-novel).',
			'',
			'## Again',
			'',
			'Open the Word Count Planner again via [/tools/word-count-planner](https://folian.app/tools/word-count-planner) and the novel-writing guide once more at [how to write a novel](https://folian.app/articles/how-to-write-a-novel).',
		].join('\n');
		const findings = runQualityChecks({
			body,
			wordCount: 80,
			siteHosts: ['folian.app'],
			inventory: [
				{ url: 'https://folian.app/tools/word-count-planner', title: 'Word Count Planner' },
				{ url: 'https://folian.app/articles/how-to-write-a-novel', title: 'How to Write a Novel' },
			],
		});
		expect(findings.some((finding) => /Word Count Planner|word_count_planner|duplicate|link|planner|novel/i.test(`${finding.code} ${finding.instruction}`))).toBe(true);
		expect(extractLinks(body, ['folian.app']).filter((link) => link.url.includes('word-count-planner')).length).toBeGreaterThan(1);
	});

	it('detects preparation-as-procrastination restated across sections', () => {
		const body = [
			'## Prep',
			'',
			'Endless preparation becomes procrastination when you never open the draft.',
			'',
			'## Draft',
			'',
			'More preparation can turn into avoidance if you delay the first scene.',
			'',
			'## Session',
			'',
			'Further research and planning stall into procrastination instead of writing pages.',
		].join('\n');
		const findings = runQualityChecks({ body, wordCount: 60 });
		expect(findings.some((finding) => finding.code === 'repeated_idea' || /procrastination|preparation/i.test(finding.instruction))).toBe(true);
	});
});
