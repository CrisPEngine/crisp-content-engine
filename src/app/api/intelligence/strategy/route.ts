import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
	airtableBrandId: z.string().min(1),
	objectives: z.array(z.string()).optional(),
	audiences: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
	audienceProblems: z.array(z.string()).optional(),
	desiredOutcomes: z.array(z.string()).optional(),
	positioning: z.string().optional(),
	keyMessages: z.array(z.string()).optional(),
	proofPoints: z.array(z.string()).optional(),
	contentPillars: z.array(z.string()).optional(),
	funnelStages: z.array(z.string()).optional(),
	ctaStrategy: z.record(z.string(), z.unknown()).optional(),
	contentMix: z.record(z.string(), z.unknown()).optional(),
	editorialThemes: z.array(z.string()).optional(),
	campaigns: z
		.array(
			z.object({
				title: z.string(),
				objective: z.string().optional(),
				description: z.string().optional(),
			}),
		)
		.optional(),
	channelStrategies: z
		.array(
			z.object({
				channel: z.string(),
				role: z.string().optional(),
				cadence: z.string().optional(),
				formats: z.array(z.string()).optional(),
			}),
		)
		.optional(),
});

export async function PUT(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = schema.parse(await request.json());
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, body.airtableBrandId);
		if (!brain) {
			return NextResponse.json({ error: 'Create Brand Brain before strategy' }, { status: 400 });
		}
		const strategy = await store.upsertStrategy(userId, {
			userId,
			brandBrainId: brain.id,
			airtableBrandId: body.airtableBrandId,
			status: 'active',
			objectives: body.objectives ?? [],
			audiences: body.audiences ?? [],
			audienceProblems: body.audienceProblems ?? [],
			desiredOutcomes: body.desiredOutcomes ?? [],
			positioning: body.positioning,
			keyMessages: body.keyMessages ?? [],
			proofPoints: body.proofPoints ?? [],
			contentPillars: body.contentPillars ?? [],
			funnelStages: (body.funnelStages ?? []) as never,
			ctaStrategy: body.ctaStrategy ?? {},
			contentMix: body.contentMix ?? {},
			editorialThemes: body.editorialThemes ?? [],
		});
		for (const campaign of body.campaigns ?? []) {
			await store.upsertCampaign(userId, {
				strategyId: strategy.id,
				title: campaign.title,
				objective: campaign.objective,
				description: campaign.description,
				status: 'planned',
			});
		}
		for (const channel of body.channelStrategies ?? []) {
			await store.upsertChannelStrategy(userId, {
				strategyId: strategy.id,
				channel: channel.channel,
				role: channel.role,
				cadence: channel.cadence,
				formats: channel.formats ?? [],
				constraints: [],
			});
		}
		return NextResponse.json({ strategy: await store.getStrategyForBrand(userId, brain.id) });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
