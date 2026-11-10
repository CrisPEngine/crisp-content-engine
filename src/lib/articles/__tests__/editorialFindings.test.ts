import { describe, expect, it } from 'vitest';
import { runDeterministicArticleReview } from '@/lib/articles/editorialReview';

const taxonomy = {
	destination: 'folian',
	schemaVersion: 1,
	categoryCreationPolicy: 'closed' as const,
	categories: [],
	contentTypes: [],
	tags: { policy: 'open' as const },
	tools: [
		{
			slug: 'word-count-planner',
			label: 'Novel Word Count Planner',
			routePath: '/tools/word-count-planner',
			linkWhenTopicMatches: 'word count|schedule|pace|length',
		},
	],
};

describe('editorial finding resolution', () => {
	it('clears missing_destination_resource when the body already links the tool', () => {
		const body = [
			'## Session',
			'',
			'Pick a realistic word count with the [Word Count Planner](https://folian.app/tools/word-count-planner) before you write.',
		].join('\n');
		const findings = runDeterministicArticleReview({
			body,
			wordCount: 40,
			targetWords: 2500,
			categoryId: 'writing-a-book',
			taxonomy,
			sourceCount: 1,
			claimsExternalResearch: false,
			toolSlugs: [],
			linkedToolSlugs: ['word-count-planner'],
			imageRequired: false,
			heroReady: true,
		});
		expect(findings.findings.some((finding) => finding.code === 'missing_destination_resource')).toBe(false);
	});

	it('keeps image_not_ready until a deliverable hero is selected', () => {
		const findings = runDeterministicArticleReview({
			body: '## One\n\nText about schedule and length.',
			wordCount: 20,
			targetWords: 2500,
			categoryId: 'writing-a-book',
			taxonomy,
			sourceCount: 0,
			claimsExternalResearch: false,
			toolSlugs: [],
			linkedToolSlugs: [],
			imageRequired: true,
			heroReady: false,
		});
		expect(findings.findings.some((finding) => finding.code === 'image_not_ready')).toBe(true);
	});
});
