import { describe, expect, it } from 'vitest';
import { sourcesForPublication } from '../publicSources';
import type { ArticleRecord } from '../types';

function article(): ArticleRecord {
	return {
		topic: 'How to write a novel',
		title: 'How to Write a Novel',
		seo: { primaryKeyword: 'how to write a novel' },
		workspace: {
			research: {
				sources: [
					{ id: 'keep', url: 'https://thewritepractice.com/write-novel/', title: 'How to Write a Novel in Six Months', domain: 'thewritepractice.com', retrievedAt: null, addedInVersion: 1, origin: 'search', excluded: true, excludedReason: 'Removed' },
					{ id: 'novel', url: 'https://www.advancedfictionwriting.com/articles/snowflake-method/', title: 'Snowflake Method', domain: 'advancedfictionwriting.com', retrievedAt: null, addedInVersion: 1, origin: 'search', excluded: false, excludedReason: null },
					{ id: 'wiki', url: 'https://en.wikipedia.org/wiki/Chris_Folayan', title: 'Chris Folayan', domain: 'en.wikipedia.org', retrievedAt: null, addedInVersion: 1, origin: 'search', excluded: false, excludedReason: null },
					{ id: 'dup', url: 'https://www.advancedfictionwriting.com/articles/snowflake-method', title: 'Snowflake Method', domain: 'advancedfictionwriting.com', retrievedAt: null, addedInVersion: 1, origin: 'search', excluded: false, excludedReason: null },
				],
				items: [{ id: 'i1', kind: 'evidence', text: 'Outline flexibly.', sourceIds: ['novel', 'wiki'], supported: true, relevance: 1, addedInVersion: 1, excluded: false, excludedReason: null }],
			},
		},
	} as ArticleRecord;
}

describe('sources for publication', () => {
	it('keeps cited on-topic sources and drops excluded, duplicate, and unrelated records', () => {
		const sources = sourcesForPublication(article());
		expect(sources.map((source) => source.publisher)).toEqual(['advancedfictionwriting.com']);
		expect(sources[0]?.url.endsWith('/')).toBe(false);
	});
});
