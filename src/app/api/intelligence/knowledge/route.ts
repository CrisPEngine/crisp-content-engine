import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';
import { applyApprovedProposals, countsFromSnapshot, decideProposals, discoverKnowledge, loadKnowledgeSnapshot, reviseProposalDescription, setCapabilityVerification } from '@/lib/intelligence/knowledge/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
	airtableBrandId: z.string().min(1),
	action: z.enum(['discover', 'decide', 'apply', 'verify', 'describe']),
	text: z.string().optional(),
	proposalId: z.string().optional(),
	ids: z.array(z.string()).optional(),
	status: z.enum(['approved', 'rejected', 'deferred']).optional(),
	verificationStatus: z.enum(['verified', 'unverified', 'verification_required', 'evidence_outdated', 'disputed']).optional(),
});

async function brainFor(userId: string, airtableBrandId: string) {
	const brain = await getIntelligenceStore().getBrandBrain(userId, airtableBrandId);
	if (!brain) {
		const error = new Error('Brand brain not found.');
		(error as Error & { status: number }).status = 404;
		throw error;
	}
	return brain;
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const airtableBrandId = new URL(request.url).searchParams.get('airtableBrandId');
		if (!airtableBrandId) return NextResponse.json({ error: 'airtableBrandId is required' }, { status: 400 });
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, airtableBrandId);
		if (!brain) return NextResponse.json({ error: 'Brand brain not found.' }, { status: 404 });
		const [snapshot, strategy, themes, edits] = await Promise.all([
			loadKnowledgeSnapshot(userId, brain.id),
			store.getStrategyForBrand(userId, brain.id),
			store.listThemes(userId, brain.id),
			store.listEditLearnings(userId, brain.id).catch(() => []),
		]);
		const counts = countsFromSnapshot(snapshot);
		return NextResponse.json({
			brandId: brain.id,
			counts,
			strategy: strategy ? { id: strategy.id, status: strategy.status, objectives: strategy.objectives, pillars: strategy.contentPillars, phase: strategy.generationMetadata?.phase ?? null } : null,
			activeThemes: themes.filter((theme) => theme.status === 'active').map((theme) => ({ id: theme.id, title: theme.title })),
			approvedLearnings: edits.filter((item) => item.status === 'accepted').length,
			proposedLearnings: edits.filter((item) => item.status === 'proposed').length,
			gaps: counts.verifiedCapabilities === 0 ? ['No capability is verified.'] : [],
			proposals: snapshot.proposals.slice(0, 60),
			capabilities: snapshot.capabilities,
		});
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = bodySchema.parse(await request.json());
		const brain = await brainFor(userId, body.airtableBrandId);
		if (body.action === 'discover') {
			const proposals = await discoverKnowledge(userId, brain, body.text);
			return NextResponse.json({ proposals, modelCalls: 0 });
		}
		if (body.action === 'decide') {
			if (!body.status || !body.ids?.length) return NextResponse.json({ error: 'Choose proposals and a decision.' }, { status: 400 });
			const updated = await decideProposals(userId, brain.id, body.ids, body.status);
			return NextResponse.json({ updated, modelCalls: 0 });
		}
		if (body.action === 'describe') {
			if (!body.proposalId || !body.text) return NextResponse.json({ error: 'Choose a proposal and a description.' }, { status: 400 });
			await reviseProposalDescription(userId, brain.id, body.proposalId, body.text);
			return NextResponse.json({ updated: 1, modelCalls: 0 });
		}
		if (body.action === 'verify') {
			if (!body.verificationStatus || !body.ids?.length) return NextResponse.json({ error: 'Choose capabilities and a verification status.' }, { status: 400 });
			const updated = await setCapabilityVerification(userId, brain, body.ids, body.verificationStatus);
			return NextResponse.json({ updated, modelCalls: 0 });
		}
		const result = await applyApprovedProposals(userId, brain, body.ids);
		return NextResponse.json({ ...result, modelCalls: 0 });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
