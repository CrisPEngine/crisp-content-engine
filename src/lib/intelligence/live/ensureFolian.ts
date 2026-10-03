import 'server-only';

import { createRecord, listRecords } from '@/lib/airtable/client';
import { getSupabaseService } from '@/lib/supabaseService';
import { folianIdentity } from '../__tests__/folianFixture';
import { FOLIAN_INCOMPLETE, FOLIAN_PROVENANCE, folianBrainPatch, folianThemes } from '../folian/nativeBrand';
import type { IntelligenceStore } from '../store';

export type FolianNativeBrand = {
	userId: string;
	brandId: string;
	airtableBrandId: string;
	airtableCreated: boolean;
	mappingId: string | null;
	incomplete: string[];
	themeTitles: string[];
	strategyId: string;
};

async function findOrCreateAirtableBrand(userId: string): Promise<{ id: string; created: boolean }> {
	const table = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!table) throw new Error('AIRTABLE_BRANDPROFILES_TABLE missing');
	const existing = await listRecords({
		table,
		filterByFormula: 'LOWER({client_name})="folian"',
		maxRecords: 1,
		fields: ['client_name'],
		returnFieldsByFieldId: false,
		cache: false,
		endpoint: '/internal/folian-brand',
	});
	if (existing[0]?.id) return { id: existing[0].id, created: false };

	const created = await createRecord({
		table,
		fields: {
			client_name: 'Folian',
			user_id: userId,
		},
	});
	if (!created?.id) throw new Error('Airtable did not return a Folian BrandProfiles id');
	return { id: created.id, created: true };
}

export async function ensureFolianNativeBrand(store: IntelligenceStore, userId: string): Promise<FolianNativeBrand> {
	const airtable = await findOrCreateAirtableBrand(userId);
	const brain = await store.upsertBrandBrain(userId, airtable.id, folianBrainPatch());
	if (!brain.examples.some((example) => example.kind === 'good' || example.kind === 'representative')) {
		await store.addExample(userId, {
			brandBrainId: brain.id,
			kind: 'representative',
			channel: 'linkedin',
			contentType: 'founder_post',
			body: 'Folian is not a ghostwriter. It is the memory layer that keeps canon from drifting between sessions.',
			whyItWorks: 'States the product boundary in the repository Folian contract.',
			metadata: { provenance: FOLIAN_PROVENANCE },
		});
	}

	const existingStrategy = await store.getStrategyForBrand(userId, brain.id);
	const linkedin = existingStrategy?.channelStrategies.find((row) => row.channel === 'linkedin');
	const strategy = await store.upsertStrategy(userId, {
		id: existingStrategy?.id,
		userId,
		brandBrainId: brain.id,
		airtableBrandId: airtable.id,
		status: 'active',
		objectives: [
			'Become the default story-memory layer for serious novelists',
			'Authority objective: make canon, continuity, and author approval the public argument',
		],
		audiences: [
			{
				name: 'Serious fiction authors',
				description: folianIdentity.audiences[0],
				problems: ['Chat tools invent facts', 'Continuity dies between sessions'],
				desiredOutcomes: ['Trusted canon', 'Finish the book they are actually writing'],
			},
		],
		audienceProblems: ['Chat tools invent facts', 'Continuity dies between sessions'],
		desiredOutcomes: ['Trusted canon', 'Fewer continuity rewrites'],
		positioning: folianIdentity.positioning,
		keyMessages: ['Memory is the product', 'Authors approve canon', 'Not a ghostwriter'],
		proofPoints: [],
		contentPillars: ['AI and authorship', 'Continuity craft', 'Author authority'],
		funnelStages: ['awareness', 'consideration'],
		ctaStrategy: {
			default: 'Invite a look at story memory; no hard sell',
			linkedin: 'Invite a specific look at story memory',
			provenance: FOLIAN_PROVENANCE,
			launchContext: 'incomplete: no verified current Folian campaign in the repository',
		},
		contentMix: { linkedin: 'primary' },
		editorialThemes: ['AI and authorship', 'Continuity craft', 'Author authority'],
	});
	await store.upsertChannelStrategy(userId, {
		id: linkedin?.id,
		strategyId: strategy.id,
		channel: 'linkedin',
		role: 'Founder authority on authorship and memory',
		cadence: 'unspecified',
		formats: ['founder_post'],
		ctaNotes: 'Invite a look at story memory; no hard sell',
		constraints: ['No growth-hacker tone', 'Low promotional intensity'],
	});

	const existingThemes = await store.listThemes(userId, brain.id);
	const themeTitles: string[] = [];
	for (const theme of folianThemes) {
		const match = existingThemes.find((row) => row.title === theme.title);
		const saved = await store.createTheme(userId, {
			id: match?.id,
			brandBrainId: brain.id,
			strategyId: strategy.id,
			title: theme.title,
			description: theme.description,
			objective: theme.objective,
			targetAudience: 'Serious fiction authors',
			relatedPillars: [...theme.relatedPillars],
			keyArguments: [...theme.keyArguments],
			subtopics: [],
			questionsToAnswer: [...theme.questionsToAnswer],
			proofPoints: [],
			keywords: ['canon', 'continuity'],
			channels: ['linkedin'],
			status: 'active',
		});
		themeTitles.push(saved.title);
	}

	const admin = getSupabaseService();
	const table = process.env.AIRTABLE_BRANDPROFILES_TABLE || 'BrandProfiles';
	const mapped = await admin
		.from('airtable_entity_map')
		.upsert(
			{
				user_id: userId,
				airtable_table: table,
				airtable_record_id: airtable.id,
				native_entity_type: 'brand_brain',
				native_entity_id: brain.id,
			},
			{ onConflict: 'airtable_table,airtable_record_id,native_entity_type' },
		)
		.select('id')
		.single();

	return {
		userId,
		brandId: brain.id,
		airtableBrandId: airtable.id,
		airtableCreated: airtable.created,
		mappingId: mapped.data?.id ?? null,
		incomplete: [...FOLIAN_INCOMPLETE],
		themeTitles,
		strategyId: strategy.id,
	};
}
