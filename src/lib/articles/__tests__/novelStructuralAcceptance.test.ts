import { describe, expect, it } from 'vitest';
import { createSupabaseNativeContentStore } from '@/lib/media/supabaseStore';
import { articleWordCount, extractHeadings, validateArticleStructure } from '@/lib/articles/structure';
import { generateArticleMetadata, metadataFieldIssues, sanitizePlainMetadata } from '@/lib/articles/seoMetadata';
import { previewStructuralRepair } from '@/lib/articles/structuralRepair';
import { commitRevision } from '@/lib/articles/revisions';
import type { ArticleRecord } from '@/lib/articles/types';

const NOVEL_ID = 'd2ed8517-ae70-41e7-9310-56f1a325b604';
const OWNER_ID = process.env.NOVEL_ACCEPTANCE_OWNER_ID ?? '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';

function proseWords(markdown: string) {
	return articleWordCount(markdown.replace(/^#{1,6}\s+.*$/gm, ''));
}

describe.runIf(process.env.RUN_NOVEL_ACCEPTANCE === '1')('novel pillar acceptance', () => {
	it('meets structural repair and metadata expectations on the Folian novel article', async () => {
		const store = createSupabaseNativeContentStore();
		const article = (await store.getArticle(OWNER_ID, NOVEL_ID)) as ArticleRecord | null;
		expect(article).toBeTruthy();
		expect(article!.title).toMatch(/Novel/i);

		const before = article!.body;
		const adjacentIssues = validateArticleStructure(before).issues.filter((issue) => issue.code === 'duplicate_adjacent_heading');
		expect(adjacentIssues.length).toBeGreaterThanOrEqual(6);

		const preview = previewStructuralRepair(before);
		expect(preview.changes.length).toBeGreaterThanOrEqual(6);
		expect(preview.canApply).toBe(true);
		expect(proseWords(preview.after)).toBe(proseWords(preview.before));

		const h2 = extractHeadings(preview.after).filter((heading) => heading.level === 2);
		expect(h2).toHaveLength(6);
		expect(new Set(h2.map((heading) => heading.text)).size).toBe(6);

		const clone = structuredClone(article!) as ArticleRecord;
		const revisionBefore = clone.workspace?.revision?.number ?? 0;
		commitRevision(clone, preview.after, 'structural_repair', 'Acceptance structural repair');
		expect((clone.workspace?.revision?.number ?? 0)).toBeGreaterThan(revisionBefore);
		expect(validateArticleStructure(clone.body).issues.filter((issue) => issue.code === 'duplicate_adjacent_heading')).toHaveLength(0);

		const generated = generateArticleMetadata(clone);
		expect(generated.metaDescription).not.toMatch(/##/);
		expect(sanitizePlainMetadata(clone.seo.metaDescription, 160)).not.toMatch(/##/);
		expect(generated.excerpt).not.toMatch(/##/);
		expect(generated.metaDescription).not.toBe(generated.excerpt);

		const bodyWordCount = proseWords(clone.body);
		clone.seo.metaDescription = generated.metaDescription;
		clone.excerpt = generated.excerpt;
		expect(proseWords(clone.body)).toBe(bodyWordCount);

		const issues = metadataFieldIssues({
			...clone,
			seo: { ...clone.seo, metaDescription: generated.metaDescription },
			excerpt: generated.excerpt,
		});
		expect(issues.filter((issue) => issue.message.includes('Markdown'))).toHaveLength(0);

		const bodyBeforeRegen = clone.body;
		clone.seo.metaDescription = `## Bad\n\n${clone.seo.metaDescription}`;
		const cleaned = generateArticleMetadata(clone);
		clone.seo.metaDescription = cleaned.metaDescription;
		clone.excerpt = cleaned.excerpt;
		expect(clone.body).toBe(bodyBeforeRegen);
		expect(clone.seo.metaDescription).not.toMatch(/##/);
	});
});
