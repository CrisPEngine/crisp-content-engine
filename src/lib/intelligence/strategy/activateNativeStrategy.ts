import 'server-only';

import { generateStrategySummary } from '@/app/api/strategy/webhook/generateStrategySummary';
import { getIntelligenceStore } from '../actions';
import { parseNativeStrategyDraft } from './nativeStrategySchema';
import { nativeStrategyDocumentFromDraft } from './nativeStrategyDocument';
import { applyDraftChannelStrategies, draftToUpsertPatch } from './strategyDraftStore';

const normaliseStatus = (status?: string) => {
	if (!status) return 'Strategy Ready';
	if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
	return status;
};

export async function activateNativeStrategyDraft(input: {
	userId: string;
	airtableBrandId: string;
}): Promise<{ ok: true; strategyId: string }> {
	const store = getIntelligenceStore();
	const brain = await store.getBrandBrain(input.userId, input.airtableBrandId);
	if (!brain) throw new Error('Brand brain not found');

	const strategy = await store.getStrategyForBrand(input.userId, brain.id);
	if (!strategy) throw new Error('Native strategy not found');
	if (!strategy.draftPayload) throw new Error('No native strategy draft to activate');

	const draft = parseNativeStrategyDraft(strategy.draftPayload);
	const themes = await store.listThemes(input.userId, brain.id);
	const patch = draftToUpsertPatch(draft);

	await store.upsertStrategy(input.userId, {
		...patch,
		id: strategy.id,
		userId: input.userId,
		brandBrainId: brain.id,
		airtableBrandId: input.airtableBrandId,
	});

	await applyDraftChannelStrategies(store, input.userId, strategy.id, draft, strategy.channelStrategies);

	const updated = await store.getStrategyForBrand(input.userId, brain.id);
	if (!updated) throw new Error('Failed to reload strategy after activation');

	const document = nativeStrategyDocumentFromDraft(brain, updated, draft, themes);
	const summary = generateStrategySummary(document);

	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;
	const tableId = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (token && baseId && tableId && !input.airtableBrandId.startsWith('local_')) {
		const fields: Record<string, unknown> = {
			strategy_json: JSON.stringify(document),
			strategy_summary: summary,
			status: normaliseStatus('Strategy Ready'),
		};
		const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${input.airtableBrandId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fields }),
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Airtable strategy sync failed: ${text.slice(0, 300)}`);
		}
	}

	return { ok: true, strategyId: strategy.id };
}
