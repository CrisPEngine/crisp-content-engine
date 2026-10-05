import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getAgentStore } from '@/lib/agent/controlStore';
import { executeResearch } from '@/lib/research/service';
import { selectSearchProvider } from '@/lib/research/search';
import type { ResearchProjectType } from '@/lib/research/types';
import { canApplyProposal } from '@/lib/research/governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = new Set<ResearchProjectType>(['BRAND_DISCOVERY', 'WEBSITE_DISCOVERY', 'COMPETITOR_RESEARCH', 'REVIEW_RESEARCH', 'TREND_RESEARCH', 'CURRENT_RESEARCH']);

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const brandId = new URL(request.url).searchParams.get('brandId') ?? '';
		const brain = await getIntelligenceStore().getBrandBrainById(userId, brandId);
		if (!brain) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
		const research = await getAgentStore().listResearch(userId, brain.id);
		return NextResponse.json({
			research: research.map((record) => ({
				id: record.id,
				request: record.request,
				createdAt: record.createdAt,
				projectType: record.packet?.projectType ?? null,
				gaps: record.packet?.gaps ?? [],
				sources: record.packet?.sources ?? record.sources,
				findings: record.packet?.findings ?? [],
				claims: record.packet?.claims ?? record.claims,
				contradictions: record.packet?.contradictions ?? [],
				proposals: record.packet?.proposals ?? [],
				competitors: record.packet?.competitors ?? [],
				trend: record.packet?.trend ?? null,
				reviewSummary: record.packet?.reviewSummary ?? null,
				promotedToBrandBrain: false,
			})),
		});
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}

export async function POST(request: Request) {
	try {
		if (process.env.RESEARCH_ENABLED === 'false') return NextResponse.json({ error: 'Research is disabled.', code: 'research_globally_disabled' }, { status: 403 });
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as { brandId?: string; website?: string; query?: string; projectType?: ResearchProjectType; confirmProposalIds?: string[]; researchId?: string };
		const brain = await getIntelligenceStore().getBrandBrainById(userId, body.brandId ?? '');
		if (!brain) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
		if (body.confirmProposalIds?.length && body.researchId) {
			const record = await getAgentStore().getResearch(userId, body.researchId);
			if (!record || record.brandId !== brain.id) return NextResponse.json({ error: 'Research not found' }, { status: 404 });
			const selected = (record.packet?.proposals ?? []).filter((proposal) => body.confirmProposalIds?.includes(proposal.id));
			const applicable = selected.filter((proposal) => canApplyProposal({ ...proposal, state: 'USER_CONFIRMED' }, 'user'));
			if (applicable.length === 0) return NextResponse.json({ applied: [], note: 'Nothing in that selection can become a Brand Brain fact.' });
			brain.knowledge.productFacts = [...(brain.knowledge.productFacts ?? []), ...applicable.map((proposal) => proposal.text)];
			await getIntelligenceStore().upsertBrandBrain(userId, brain.airtableBrandId, { knowledge: brain.knowledge });
			return NextResponse.json({ applied: applicable.map((proposal) => proposal.id), promotedToBrandBrain: true });
		}
		const projectType = body.projectType && TYPES.has(body.projectType) ? body.projectType : 'BRAND_DISCOVERY';
		const provider = selectSearchProvider();
		const record = await executeResearch({
			ownerUserId: userId,
			brandId: brain.id,
			brandName: brain.identity.name,
			website: body.website,
			query: body.query || `Research ${brain.identity.name}`,
			projectType,
			brandFacts: brain.knowledge.brandFacts,
			search: provider.configured ? provider : { name: provider.name, configured: false, async search() { return []; } },
		});
		return NextResponse.json({ researchId: record.id, packet: record.packet, promotedToBrandBrain: false });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Research failed';
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
