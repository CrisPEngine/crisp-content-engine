import { NextResponse } from 'next/server';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import {
	createNativeGenerationJob,
	dispatchNativeContentBatchWorker,
} from '@/lib/intelligence/content/nativeBatchGeneration';
import { assertStrategyReadyForContent } from '@/lib/intelligence/strategy/strategyCompleteness';

export const runtime = 'nodejs';

type BrandTarget = { brandProfileId: string; ownerUserId: string };

async function loadAutoGenerateTargets(input: {
	userId?: string;
	brandProfileId?: string;
}): Promise<BrandTarget[]> {
	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE) {
		throw new Error('Airtable configuration missing');
	}

	if (input.brandProfileId) {
		const brandRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${input.brandProfileId}`,
			{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' } },
		);
		if (!brandRes.ok) return [];
		const brandRecord = await brandRes.json();
		if (brandRecord.fields?.auto_generate_content !== true) return [];
		const ownerUserId = String(brandRecord.fields?.user_id ?? input.userId ?? '');
		if (!ownerUserId) return [];
		return [{ brandProfileId: input.brandProfileId, ownerUserId }];
	}

	if (!input.userId) return [];

	const filter = `AND({user_id} = "${input.userId}", {auto_generate_content} = TRUE())`;
	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`);
	url.searchParams.set('filterByFormula', filter);
	const brandsRes = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
	});
	if (!brandsRes.ok) return [];
	const data = await brandsRes.json();
	return (data.records ?? []).map((record: { id: string }) => ({
		brandProfileId: record.id,
		ownerUserId: input.userId!,
	}));
}

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const userId = body?.userId as string | undefined;
		const brandProfileId = body?.brand_profile_id as string | undefined;

		if (!userId && !brandProfileId) {
			return NextResponse.json({ error: 'Either userId or brand_profile_id is required' }, { status: 400 });
		}

		if (!isLegacyMakeEnabled()) {
			const store = getIntelligenceStore();
			const targets = await loadAutoGenerateTargets({ userId, brandProfileId });
			const jobs: Array<{ brand_profile_id: string; generation_job_id?: string; error?: string }> = [];

			for (const target of targets) {
				const brain = await store.getBrandBrain(target.ownerUserId, target.brandProfileId);
				const strategy = brain ? await store.getStrategyForBrand(target.ownerUserId, brain.id) : null;
				const gate = assertStrategyReadyForContent(strategy);
				if (!gate.ok) {
					jobs.push({ brand_profile_id: target.brandProfileId, error: gate.message });
					continue;
				}
				const { generation_job_id } = await createNativeGenerationJob({
					userId: target.ownerUserId,
					brandProfileId: target.brandProfileId,
					channels: [
						{ platform: 'LinkedIn', count: 2 },
						{ platform: 'Blog', count: 1 },
					],
				});
				await dispatchNativeContentBatchWorker(generation_job_id).catch((err) => {
					console.error('[Auto-generate native] dispatch failed:', err);
				});
				jobs.push({ brand_profile_id: target.brandProfileId, generation_job_id });
			}

			return NextResponse.json({ ok: true, engine: 'native', jobs });
		}

		return NextResponse.json(
			{
				error: 'Legacy Make auto-generate is disabled. Use native renewal generation or Quick Generate.',
				code: 'legacy_make_disabled',
			},
			{ status: 503 },
		);
	} catch (error: unknown) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Auto-generate failed' },
			{ status: 500 },
		);
	}
}
