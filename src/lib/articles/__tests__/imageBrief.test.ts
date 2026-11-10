import { describe, expect, it } from 'vitest';
import { buildArticleImagePrompt, conceptSimilarityWarning, suggestImageConcept } from '@/lib/articles/imageBrief';
import { buildImagePrompt } from '@/lib/media/prompt';

describe('imageBrief', () => {
	it('suggests distinct hero and social concepts', () => {
		const hero = suggestImageConcept({ role: 'hero', title: 'How to Start Writing a Book', topic: 'how to start writing a book' });
		const og = suggestImageConcept({ role: 'og', title: 'How to Start Writing a Book', topic: 'how to start writing a book' });
		expect(hero).toMatch(/16:9/);
		expect(og).toMatch(/1\.91:1|thumbnail/i);
		expect(hero).not.toEqual(og);
	});

	it('includes revision instructions and negative constraints in prompts', () => {
		const built = buildArticleImagePrompt({
			role: 'hero',
			topic: 'writing',
			concept: 'Cafe table with a real product screenshot on the laptop',
			negativeConstraints: 'no neon, no robots',
			revisionInstructions: 'Make the cafe warmer and keep the UI legible',
		});
		expect(built.prompt).toMatch(/Revision instructions/);
		expect(built.prompt).toMatch(/no neon/);
		expect(built.prompt).toMatch(/preserve its real UI/i);
		expect(built.dimensions).toBe('16:9');
	});

	it('warns when concepts are substantially similar', () => {
		const warning = conceptSimilarityWarning(
			'Quiet cafe table with open notebook and coffee',
			['Quiet cafe table with open notebook beside coffee cup'],
		);
		expect(warning).toMatch(/similar/i);
	});

	it('keeps editable prompt builder brand-agnostic', () => {
		const prompt = buildImagePrompt({
			channel: 'BLOG',
			purpose: 'Article hero image',
			concept: 'A workshop bench with printed pages',
			aspectRatio: '16:9',
			topic: 'editing',
		});
		expect(prompt.prompt).not.toMatch(/Folian/i);
	});
});
