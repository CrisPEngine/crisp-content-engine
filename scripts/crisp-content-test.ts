import { getSupabaseService } from '@/lib/supabaseService';
import { createSupabaseIntelligenceStore } from '@/lib/intelligence/supabaseStore';
import { runContentIntelligencePipeline } from '@/lib/intelligence/pipeline';
import { planMedia } from '@/lib/media/planner';
import { CRISP_CANONICAL_AIRTABLE_ID } from '@/lib/intelligence/crisp/nativeBrand';

const userIntent = 'Create a CrisP Digital LinkedIn post about the opportunity for businesses to advertise through ChatGPT and why brands should start preparing for this emerging channel.';

async function main() {
	const admin = getSupabaseService();
	const { data: brain, error } = await admin
		.from('brand_brains')
		.select('id,user_id')
		.eq('airtable_brand_id', CRISP_CANONICAL_AIRTABLE_ID)
		.single();
	if (error || !brain) throw new Error(error?.message || 'CrisP brand brain missing');
	const store = createSupabaseIntelligenceStore();
	const result = await runContentIntelligencePipeline(store, {
		userId: String(brain.user_id),
		airtableBrandId: CRISP_CANONICAL_AIRTABLE_ID,
		userIntent,
		channel: 'linkedin',
		contentType: 'company_post',
		optimizationObjective: 'authority',
	});
	const media = planMedia({
		channel: 'LINKEDIN_ORGANIZATION',
		topic: result.brief.payload.topic,
		objective: result.brief.payload.objective,
		contentType: 'company_post',
		assets: [],
	});
	const { data: saved } = await admin.from('content_memory').select('publication_status').eq('id', result.memory.id).single();
	console.log(JSON.stringify({
		memoryId: result.memory.id,
		publicationStatus: saved?.publication_status ?? result.memory.publicationStatus,
		brief: result.brief.payload,
		aiDraft: result.aiDraft,
		reviewedDraft: result.reviewedDraft,
		review: {
			brandFit: result.review.brandFit,
			materialPassed: result.review.materialPassed,
			changed: result.review.changed,
			findings: result.review.findings,
			revisionReason: result.review.revisionReason,
		},
		score: result.score,
		media,
		usage: result.usage,
		estimatedCostUsd: result.estimatedCostUsd,
	}, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'content test failed');
	process.exit(1);
});
