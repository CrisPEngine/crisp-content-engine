import 'server-only';

import { getIntelligenceStore } from '../actions';
import { activateLegacyBrand } from '../legacy/activate';
import { mapOnboardingToNative, type OnboardingNativeInput } from '../onboarding/mapOnboardingToNative';
import { enqueueNativeStrategyGeneration } from './generationJob';
import { scoreStrategyCompleteness, strategyGenerationPhase } from './strategyCompleteness';
import { strategyRowToSnapshotPayload } from './strategyDraftStore';
import { executeResearch } from '@/lib/research/service';
import { selectSearchProvider } from '@/lib/research/search';

export type BrandMigrationRow = {
	brandBrainId: string;
	airtableBrandId: string;
	brandName: string;
	nativePhase: string;
	completenessScore: number;
	complete: boolean;
	isSkeleton: boolean;
	airtableStatus?: string;
};

async function fetchAirtableStrategyJson(airtableBrandId: string): Promise<Record<string, unknown> | null> {
	const token = process.env.AIRTABLE_PAT;
	const baseId = process.env.AIRTABLE_BASE_ID;
	const tableId = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!token || !baseId || !tableId || airtableBrandId.startsWith('local_')) return null;
	const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${airtableBrandId}`, {
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	});
	if (!res.ok) return null;
	const record = await res.json();
	const raw = record.fields?.strategy_json || record.fields?.strategy_payload;
	if (!raw) return null;
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	return raw as Record<string, unknown>;
}

export async function listBrandNativeMigrationStatus(ownerUserId: string): Promise<BrandMigrationRow[]> {
	const store = getIntelligenceStore();
	const brains = await store.listBrandBrains(ownerUserId);
	const rows: BrandMigrationRow[] = [];
	for (const brain of brains) {
		const strategy = await store.getStrategyForBrand(ownerUserId, brain.id);
		const completeness = scoreStrategyCompleteness(strategy);
		rows.push({
			brandBrainId: brain.id,
			airtableBrandId: brain.airtableBrandId,
			brandName: brain.identity.name,
			nativePhase: strategyGenerationPhase(strategy),
			completenessScore: completeness.score,
			complete: completeness.complete,
			isSkeleton: completeness.isSkeleton,
		});
	}
	return rows;
}

export async function backfillBrandNativeStrategy(input: {
	ownerUserId: string;
	airtableBrandId: string;
	escalate?: boolean;
	runWebsiteResearch?: boolean;
}): Promise<{ jobId: string; importedSnapshot: boolean }> {
	const store = getIntelligenceStore();
	const brain = await store.getBrandBrain(input.ownerUserId, input.airtableBrandId);
	if (!brain) throw new Error('Brand brain not found');

	const imported = await fetchAirtableStrategyJson(input.airtableBrandId);
	const strategy = await store.getStrategyForBrand(input.ownerUserId, brain.id);
	if (strategy && imported) {
		await store.snapshotStrategy(input.ownerUserId, strategy.id, {
			...strategyRowToSnapshotPayload(strategy),
			importedMakeStrategy: imported,
		}, 'imported_make_reference');
	}

	let researchId: string | undefined;
	if (input.runWebsiteResearch !== false && brain.identity.website?.trim()) {
		const provider = selectSearchProvider();
		const record = await executeResearch({
			ownerUserId: input.ownerUserId,
			brandId: brain.id,
			brandName: brain.identity.name,
			website: brain.identity.website,
			query: `Website discovery for ${brain.identity.name}`,
			projectType: 'WEBSITE_DISCOVERY',
			brandFacts: brain.knowledge.brandFacts,
			search: provider.configured ? provider : { name: provider.name, configured: false, async search() { return []; } },
		});
		researchId = record.id;
	}

	const makeReference = imported
		? `\n\nReference only (do not copy verbatim): prior Make/Airtable strategy JSON:\n${JSON.stringify(imported).slice(0, 12000)}`
		: '';

	const job = await enqueueNativeStrategyGeneration({
		ownerUserId: input.ownerUserId,
		airtableBrandId: input.airtableBrandId,
		brandBrainId: brain.id,
		researchId,
		escalate: input.escalate ?? true,
		source: 'admin_backfill',
		instructions: `Produce a full native strategy draft. Use brand brain facts and research only for proof.${makeReference}`,
	});

	return { jobId: job.id, importedSnapshot: Boolean(imported && strategy) };
}

/** Idempotent: ensure brain exists from Airtable profile fields when missing. */
export async function ensureBrainFromAirtableProfile(input: {
	ownerUserId: string;
	airtableBrandId: string;
	fields: Record<string, unknown>;
}): Promise<string> {
	const store = getIntelligenceStore();
	const existing = await store.getBrandBrain(input.ownerUserId, input.airtableBrandId);
	if (existing) return existing.id;

	const onboarding: OnboardingNativeInput = {
		brandType: (input.fields.brand_type as 'company' | 'personal') ?? 'company',
		clientName: String(input.fields.client_name ?? 'Brand'),
		website: String(input.fields.website ?? ''),
		audience: String(input.fields.audience ?? ''),
		valueProps: String(input.fields.value_props ?? ''),
		offers: String(input.fields.offers ?? ''),
		brandGoals: String(input.fields.brand_goals ?? ''),
		platformsRequested: Array.isArray(input.fields.platforms_requested)
			? (input.fields.platforms_requested as string[])
			: ['LinkedIn'],
		timezone: String(input.fields.timezone ?? 'UTC'),
		languageRegion: String(input.fields.language_region ?? 'US English'),
		preferredImageSource: String(input.fields.preferred_image_source ?? 'stock'),
	};
	const mapped = mapOnboardingToNative(onboarding);
	const activated = await activateLegacyBrand(store, {
		userId: input.ownerUserId,
		airtableTable: process.env.AIRTABLE_BRANDPROFILES_TABLE ?? 'BrandProfiles',
		profiles: [{ id: input.airtableBrandId, clientName: onboarding.clientName, ownerUserId: input.ownerUserId }],
		selectedId: input.airtableBrandId,
		reason: 'backfill',
		brain: {
			identity: mapped.identity,
			voice: mapped.voice,
			guardrails: mapped.guardrails,
			knowledge: mapped.knowledge,
		},
		strategy: mapped.strategy,
		themes: [],
	});
	return activated.brandId;
}
