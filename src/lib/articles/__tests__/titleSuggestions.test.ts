import { describe, expect, it } from 'vitest';
import { suggestArticleTitles } from '@/lib/articles/titleSuggestions';

describe('titleSuggestions', () => {
	it('returns up to three distinct alternatives with rationales', () => {
		const suggestions = suggestArticleTitles({
			currentTitle: 'How to Start Writing a Book (Step-by-Step Guide for Beginners)',
			topic: 'how to start writing a book',
			primaryKeyword: 'how to start writing a book',
			audience: 'beginners',
			searchIntent: 'informational',
			readerOutcome: 'Write the first pages and plan the next session',
			existingTitles: ['How to Write a Novel: From Idea to First Draft'],
		});
		expect(suggestions.length).toBeGreaterThan(0);
		expect(suggestions.length).toBeLessThanOrEqual(3);
		for (const suggestion of suggestions) {
			expect(suggestion.title).toBeTruthy();
			expect(suggestion.rationale).toBeTruthy();
			expect(suggestion.rationale.toLowerCase()).not.toMatch(/rank|traffic|aeo score/);
		}
	});
});
