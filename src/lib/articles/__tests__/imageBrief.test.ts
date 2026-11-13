import { describe, expect, it } from 'vitest';
import {
	buildArticleImagePrompt,
	conceptSimilarityWarning,
	normaliseImageBrief,
	isVisuallyActionableConcept,
	suggestImageConcept,
	summariseCoherently,
	wordCount,
} from '@/lib/articles/imageBrief';
import { buildImagePrompt } from '@/lib/media/prompt';
import { isPlaceholderAltText } from '@/lib/media/altText';

describe('imageBrief', () => {
	it('does not truncate concepts mid-sentence from long introductions', () => {
		const longIntro =
			'Before you write page one, choose a project to try, not a permanent identity as a writer. You do not need to settle your title, commit to a narrow genre, or see the whole book. You need enough of a choice to say, “This is the material I want to spend time with for now.”';
		const concept = suggestImageConcept({
			role: 'hero',
			title: 'How to Start Writing a Book (Step-by-Step Guide for Beginners)',
			topic: 'how to start writing a book',
			excerpt: longIntro,
			audience: 'Aspiring authors and first-time novelists',
			hasProductScreenshot: true,
		});
		expect(concept.endsWith('This i')).toBe(false);
		expect(concept).not.toMatch(/You need enough of a choice to say/);
		expect(wordCount(concept)).toBeGreaterThanOrEqual(30);
		expect(wordCount(concept)).toBeLessThanOrEqual(95);
		expect(isVisuallyActionableConcept(concept)).toBe(true);
		expect(concept.toLowerCase()).toMatch(/café|cafe|writer|morning|laptop|interface/);
	});

	it('summarises coherently instead of cutting mid-word', () => {
		const summary = summariseCoherently('Alpha beta gamma. Delta epsilon zeta eta theta.', 28);
		expect(summary.endsWith('gamm')).toBe(false);
		expect(summary).toMatch(/\.$|…$/);
	});

	it('suggests distinct hero and social concepts', () => {
		const hero = suggestImageConcept({ role: 'hero', title: 'How to Start Writing a Book', topic: 'how to start writing a book' });
		const og = suggestImageConcept({ role: 'og', title: 'How to Start Writing a Book', topic: 'how to start writing a book' });
		expect(hero).not.toEqual(og);
		expect(og).toMatch(/1\.91:1|thumbnail|social|tight/i);
	});

	it('builds prompts from approved concept without pasting article prose', () => {
		const built = buildArticleImagePrompt({
			role: 'hero',
			topic: 'writing',
			concept: 'A first-time writer in a café with a laptop showing a genuine product interface.',
			negativeConstraints: 'no neon',
			revisionInstructions: 'Warmer light',
			hasProductReference: true,
		});
		expect(built.prompt).toMatch(/Approved visual concept/);
		expect(built.prompt).toMatch(/genuine product screenshot/i);
		expect(built.prompt).not.toMatch(/You need enough of a choice/);
		expect(built.dimensions).toBe('16:9');
	});

	it('renders a legacy hero brief that never stored revision instructions', () => {
		const brief = normaliseImageBrief({ concept: 'A café writer', prompt: 'old prompt', history: [{ at: '', prompt: 'old', concept: 'A café writer', assetId: null, url: null, reused: false, estimatedCostUsd: null }] }, 'hero');
		expect(brief.revisionInstructions.trim()).toBe('');
		expect(brief.negativeConstraints.trim()).toBe('');
		expect(brief.concept.trim()).toMatch(/café/);
		expect(() => brief.history[0]?.concept.trim()).not.toThrow();
	});

	it('warns when concepts are substantially similar', () => {
		const warning = conceptSimilarityWarning(
			'Quiet cafe table with open notebook and coffee',
			['Quiet cafe table with open notebook beside coffee cup'],
		);
		expect(warning).toMatch(/similar/i);
	});

	it('keeps prompt builder brand-agnostic', () => {
		const prompt = buildImagePrompt({
			channel: 'BLOG',
			purpose: 'Article hero image',
			concept: 'A workshop bench with printed pages',
			aspectRatio: '16:9',
			topic: 'editing',
		});
		expect(prompt.prompt).not.toMatch(/Folian/i);
	});

	it('treats instructional alt directions as placeholders', () => {
		expect(isPlaceholderAltText('Describe the hero image accurately for accessibility.')).toBe(true);
		expect(isPlaceholderAltText('A writer at a sunlit café table with an open notebook.')).toBe(false);
	});
});
