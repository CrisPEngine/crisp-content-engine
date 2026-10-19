import 'server-only';

import {
	createNativeGenerationJob,
	dispatchNativeContentBatchWorker,
} from '@/lib/intelligence/content/nativeBatchGeneration';
import { assertStrategyReadyForContent } from '@/lib/intelligence/strategy/strategyCompleteness';
import { getIntelligenceStore } from '@/lib/intelligence/actions';

export async function triggerNativeContentFromBrief(input: {
	userId: string;
	brandProfileId: string;
	briefId: string;
}): Promise<{ generation_job_id: string }> {
	const store = getIntelligenceStore();
	const brain = await store.getBrandBrain(input.userId, input.brandProfileId);
	if (!brain) throw new Error('Brand brain not found');
	const strategy = await store.getStrategyForBrand(input.userId, brain.id);
	const gate = assertStrategyReadyForContent(strategy);
	if (!gate.ok) {
		throw new Error(gate.message);
	}

	const channels = [
		{ platform: 'LinkedIn' as const, count: 2 },
		{ platform: 'Blog' as const, count: 1 },
	];

	const { generation_job_id } = await createNativeGenerationJob({
		userId: input.userId,
		brandProfileId: input.brandProfileId,
		channels,
	});

	await dispatchNativeContentBatchWorker(generation_job_id).catch((err) => {
		console.error('[Native brief content] worker dispatch failed:', err);
	});

	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;
	const tableId = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
	if (token && baseId && tableId) {
		await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${input.briefId}`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fields: {
					status: 'Native Generation',
					last_error: null,
					strategy_meta: JSON.stringify({ generation_job_id, engine: 'native' }),
				},
			}),
		}).catch(() => undefined);
	}

	return { generation_job_id };
}
