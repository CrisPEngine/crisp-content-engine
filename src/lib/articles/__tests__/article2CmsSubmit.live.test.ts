import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { setNativeContentStoreForTests } from '@/lib/media/store';
import { createSupabaseNativeContentStore } from '@/lib/media/supabaseStore';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createSupabaseIntelligenceStore } from '@/lib/intelligence/supabaseStore';

function loadEnv(file: string) {
	for (const line of readFileSync(file, 'utf8').split(/\n/)) {
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const i = line.indexOf('=');
		const key = line.slice(0, i);
		let value = line.slice(i + 1);
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (!process.env[key]) process.env[key] = value;
	}
}

const live = process.env.RUN_ARTICLE2_CMS_SUBMIT === '1';

describe.runIf(live)('Article 2 CMS submit live QA', () => {
	it(
		'assigns a unique ID, approves, submits a separate Folian draft, and leaves Article 1 untouched',
		async () => {
			loadEnv('/Users/chrispascoe/Projects/crisp-content-engine/.env.local');
			loadEnv('/Users/chrispascoe/Projects/crisp-content-engine/.env.production.local');
			process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
			setNativeContentStoreForTests(createSupabaseNativeContentStore());
			setIntelligenceStoreForTests(createSupabaseIntelligenceStore());

			const ownerUserId = '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';
			const article2Id = '08776e21-147f-4353-8ad5-10249b8c86c9';
			const article1Id = 'd2ed8517-ae70-41e7-9310-56f1a325b604';
			const {
				ensureArticleCmsExternalId,
				approveWorkspaceArticle,
				submitArticleDraft,
				saveArticleDraft,
				getWorkspaceArticle,
			} = await import('@/lib/articles/workspace');

			const beforeArticle1 = await getWorkspaceArticle(ownerUserId, article1Id);
			expect(beforeArticle1.article.workspace?.cms.externalId).toBe('cce_pillar_novel-first-draft');

			await saveArticleDraft(ownerUserId, article2Id, {
				title: 'How to Start Writing a Book: From First Idea to First Page',
				workingTitle: 'How to Start Writing a Book: From First Idea to First Page',
				slug: 'how-to-start-writing-a-book',
				seoTitle: 'How to Start Writing a Book: From First Idea to First Page',
				approveSlugChange: true,
			});

			const withId = await ensureArticleCmsExternalId(ownerUserId, article2Id);
			const externalId = withId.workspace?.externalId || withId.workspace?.cms.externalId;
			expect(externalId).toBeTruthy();
			expect(externalId).not.toBe('cce_pillar_novel-first-draft');
			expect(externalId).toMatch(/^cce_how-to-start-writing-a-book/);

			const approved = await approveWorkspaceArticle(ownerUserId, article2Id);
			expect(approved.approval.status).toBe('approved');
			expect(approved.status).toBe('approved');

			const submitted = await submitArticleDraft(ownerUserId, article2Id);
			expect(submitted.workspace?.cms.lastSyncAt).toBeTruthy();
			expect(submitted.workspace?.cms.lastError).toBeNull();
			expect(submitted.workspace?.cms.externalId).toBe(externalId);
			expect(submitted.workspace?.cms.lastSubmission?.ok).toBe(true);

			const afterArticle1 = await getWorkspaceArticle(ownerUserId, article1Id);
			expect(afterArticle1.article.workspace?.cms.externalId).toBe('cce_pillar_novel-first-draft');
			expect(afterArticle1.article.slug).toBe('how-to-write-a-novel');

			const base = (process.env.FOLIAN_CONTENT_API_URL || '').replace(/\/+$/, '');
			const key = process.env.FOLIAN_CONTENT_API_KEY!;
			const bypass = process.env.FOLIAN_VERCEL_PROTECTION_BYPASS;
			const headers: Record<string, string> = {
				Authorization: `Bearer ${key}`,
				...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
			};
			const article2Lookup = await fetch(`${base}/api/content/v1/drafts/${encodeURIComponent(externalId!)}`, { headers });
			const article2Json = (await article2Lookup.json()) as { draft?: { title?: string; slug?: string; status?: string; category?: string; revision?: number }; adminUrl?: string; url?: string };
			expect(article2Lookup.status).toBe(200);
			expect(article2Json.draft?.slug).toBe('how-to-start-writing-a-book');
			expect(article2Json.draft?.title).toMatch(/How to Start Writing a Book/);
			expect(article2Json.draft?.category).toBe('writing-a-book');
			expect(article2Json.draft?.status).not.toBe('published');

			const article1Lookup = await fetch(`${base}/api/content/v1/drafts/cce_pillar_novel-first-draft`, { headers });
			const article1Json = (await article1Lookup.json()) as { draft?: { slug?: string; status?: string; title?: string; revision?: number } };
			expect(article1Lookup.status).toBe(200);
			expect(article1Json.draft?.slug).toBe('how-to-write-a-novel');
			expect(article1Json.draft?.status).toBe('published');
			expect(article1Json.draft?.title).toBe('How to Write a Novel: From Idea to First Draft');

			console.log(
				JSON.stringify(
					{
						externalId,
						approval: approved.approval.status,
						submission: submitted.workspace?.cms.lastSubmission,
						draftUrl: submitted.workspace?.cms.draftUrl,
						payload: {
							title: article2Json.draft?.title,
							slug: article2Json.draft?.slug,
							status: article2Json.draft?.status,
							category: article2Json.draft?.category,
							revision: article2Json.draft?.revision,
							adminUrl: article2Json.adminUrl,
						},
						article1: {
							externalId: 'cce_pillar_novel-first-draft',
							slug: article1Json.draft?.slug,
							status: article1Json.draft?.status,
							revision: article1Json.draft?.revision,
						},
					},
					null,
					2,
				),
			);
		},
		300_000,
	);
});
