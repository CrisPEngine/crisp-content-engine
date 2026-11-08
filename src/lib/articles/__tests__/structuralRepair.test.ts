import { describe, expect, it } from 'vitest';
import { extractHeadings, validateArticleStructure } from '@/lib/articles/structure';
import { articleWordCount } from '@/lib/articles/structure';
import { previewStructuralRepair, removeDuplicateAdjacentHeadings } from '@/lib/articles/structuralRepair';

function proseWords(markdown: string) {
	return articleWordCount(markdown.replace(/^#{1,6}\s+.*$/gm, ''));
}

describe('structuralRepair', () => {
	it('removes consecutive duplicate headings without deleting prose', () => {
		const body = ['## First', '', '## First', '', 'Paragraph one.', '', '## Second', 'More.'].join('\n');
		const { body: repaired, changes } = removeDuplicateAdjacentHeadings(body);
		expect(changes).toHaveLength(1);
		expect(repaired).toContain('Paragraph one.');
		expect(repaired).not.toMatch(/^## First\n\n## First/m);
		const preview = previewStructuralRepair(body);
		expect(preview.canApply).toBe(true);
		expect(proseWords(preview.after)).toBe(proseWords(preview.before));
		expect(validateArticleStructure(preview.after).issues.filter((issue) => issue.code === 'duplicate_adjacent_heading').length).toBe(0);
	});

	it('fixes twelve adjacent duplicate headings into six unique H2s (pillar pattern)', () => {
		const sections = [1, 2, 3, 4, 5, 6].map((n) => `## ${n}. Section title\n\n## ${n}. Section title\n\nBody for section ${n}.\n\n`);
		const body = `# Novel\n\n${sections.join('')}`;
		const preview = previewStructuralRepair(body);
		expect(preview.changes.length).toBe(6);
		expect(preview.canApply).toBe(true);
		const headings = extractHeadings(preview.after).filter((heading) => heading.level === 2);
		expect(headings).toHaveLength(6);
		const titles = headings.map((heading) => heading.text);
		expect(new Set(titles).size).toBe(6);
		expect(proseWords(preview.after)).toBe(proseWords(preview.before));
	});
});
