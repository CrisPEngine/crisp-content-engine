import { generateSidecarDraft } from '@/lib/sidecar/draft';
import { sidecarOptionsResponse } from '@/lib/sidecar/cors';
import { runSidecarRoute } from '@/lib/sidecar/handler';
import { enforceSidecarDraftRateLimit, getClientIp } from '@/lib/sidecar/rateLimit';
import { sidecarDraftRequestSchema } from '@/lib/sidecar/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
	return sidecarOptionsResponse(request);
}

export async function POST(request: Request) {
	return runSidecarRoute(request, async (actor, req) => {
		const body = await req.json().catch(() => ({}));
		const input = sidecarDraftRequestSchema.parse(body);

		enforceSidecarDraftRateLimit(`sidecar-draft:${getClientIp(req)}`);

		const draft = await generateSidecarDraft(actor.userId, input);

		return {
			draftText: draft.draftText,
			shortAlternative: draft.shortAlternative,
			fitScore: draft.fitScore,
			opportunitySummary: draft.opportunitySummary,
			recommendedAction: draft.recommendedAction,
			ctaRecommendation: draft.ctaRecommendation,
			linkRecommendation: draft.linkRecommendation,
			riskNotes: draft.riskNotes,
			suggestedFollowUp: draft.suggestedFollowUp,
			suggestedTags: draft.suggestedTags,
			suggestedContentIdea: draft.suggestedContentIdea,
			brandId: draft.brandId,
			brandName: draft.brandName,
		};
	});
}
