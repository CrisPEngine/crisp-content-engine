import { describe, expect, it } from 'vitest';
import { bodyLinksDestinationTool, linkedToolSlugsFromBody } from '@/lib/articles/linkPresence';

const planner = {
	slug: 'word-count-planner',
	label: 'Novel Word Count Planner',
	routePath: '/tools/word-count-planner',
};

describe('linkPresence', () => {
	it('recognises absolute Folian planner links', () => {
		const body = 'Set a target with the [Word Count Planner](https://folian.app/tools/word-count-planner).';
		expect(bodyLinksDestinationTool(body, planner)).toBe(true);
		expect(linkedToolSlugsFromBody(body, [planner])).toEqual(['word-count-planner']);
	});

	it('recognises relative tool paths', () => {
		expect(bodyLinksDestinationTool('See [/tools/word-count-planner](/tools/word-count-planner).', planner)).toBe(true);
	});

	it('does not treat relatedTools metadata as a body link', () => {
		expect(bodyLinksDestinationTool('Talk about word count and schedule without a URL.', planner)).toBe(false);
	});
});
