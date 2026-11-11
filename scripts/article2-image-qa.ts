import { readFileSync } from 'fs';

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

loadEnv(new URL('../.env.production.local', import.meta.url).pathname);
loadEnv(new URL('../.env.local', import.meta.url).pathname);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

async function main() {
	const { setNativeContentStoreForTests } = await import('../src/lib/media/store');
	const { createSupabaseNativeContentStore } = await import('../src/lib/media/supabaseStore');
	const { setIntelligenceStoreForTests } = await import('../src/lib/intelligence/actions');
	const { createSupabaseIntelligenceStore } = await import('../src/lib/intelligence/supabaseStore');
	setNativeContentStoreForTests(createSupabaseNativeContentStore());
	setIntelligenceStoreForTests(createSupabaseIntelligenceStore());

	const { prepareArticleImageBrief, proposeArticleImageReferences, generateArticleMedia, refreshArticleImageAlt } = await import(
		'../src/lib/articles/workspace'
	);

	const ownerUserId = '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';
	const articleId = '08776e21-147f-4353-8ad5-10249b8c86c9';
	const prepared = await prepareArticleImageBrief(ownerUserId, articleId, 'hero', { applySuggestedConcept: true, rebuildPrompt: true });
	const refs = await proposeArticleImageReferences(ownerUserId, articleId, 'hero');
	const concept = prepared.brief.concept;
	console.log(
		JSON.stringify(
			{
				phase: 'prepare',
				concept,
				wordCount: concept.trim().split(/\s+/).length,
				truncated: concept.endsWith('This i') || /You need enough of a choice to say/.test(concept),
				promptHasArticleProse: /You need enough of a choice to say/.test(prepared.brief.prompt),
				model: prepared.brief.model,
				estimatedCostUsd: prepared.brief.estimatedCostUsd,
				referenceAssetIds: prepared.brief.referenceAssetIds,
				proposals: refs.proposals.slice(0, 6).map((row) => ({
					title: row.asset.title,
					type: row.typeLabel,
					recommended: row.recommended,
					score: row.score,
				})),
				heroAltBefore: prepared.article.workspace?.media?.heroAlt || '',
			},
			null,
			2,
		),
	);

	if (process.env.ARTICLE2_IMAGE_GENERATE !== '1') {
		console.log('Set ARTICLE2_IMAGE_GENERATE=1 to regenerate hero (costs money).');
		return;
	}

	const generated = await generateArticleMedia(ownerUserId, articleId, 'hero', {
		concept: prepared.brief.concept,
		prompt: prepared.brief.prompt,
		referenceAssetIds: prepared.brief.referenceAssetIds,
		forceNew: true,
	});
	let article = generated;
	if (!article.workspace?.media?.heroAlt || /describe the hero/i.test(article.workspace.media.heroAlt)) {
		article = await refreshArticleImageAlt(ownerUserId, articleId, 'hero');
	}
	console.log(
		JSON.stringify(
			{
				phase: 'generate',
				heroUrl: article.workspace?.media?.heroUrl,
				heroAlt: article.workspace?.media?.heroAlt,
				altStatus: article.workspace?.media?.creative?.hero?.altStatus,
				qualityFindings: article.workspace?.media?.creative?.hero?.qualityFindings,
				model: article.workspace?.media?.creative?.hero?.model,
				lastCostUsd: article.workspace?.media?.creative?.hero?.lastCostUsd,
				candidates: article.workspace?.media?.creative?.hero?.candidates?.length,
				deliveryVerified: article.workspace?.media?.deliveryVerified,
				deliveryError: article.workspace?.media?.deliveryError,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
