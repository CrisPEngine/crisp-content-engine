import { getSupabaseService } from '@/lib/supabaseService';
import { createSupabaseIntelligenceStore } from '@/lib/intelligence/supabaseStore';
import { activateLegacyBrand } from '@/lib/intelligence/legacy/activate';
import { auditBrandChannels } from '@/lib/intelligence/legacy/channels';
import {
	CRISP_CANONICAL_AIRTABLE_ID,
	CRISP_RECONCILIATION_REASON,
	CRISP_RETAINED_PRODUCT_PROFILE_ID,
	crispGuardrails,
	crispIdentity,
	crispKnowledge,
	crispThemes,
	crispVoice,
} from '@/lib/intelligence/crisp/nativeBrand';

type AirtableRecord = { id: string; createdTime?: string; fields?: Record<string, unknown> };

async function airtableGet(path: string): Promise<unknown> {
	const token = process.env.AIRTABLE_PAT;
	const base = process.env.AIRTABLE_BASE_ID;
	if (!token || !base) throw new Error('Airtable is not configured');
	const response = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) throw new Error(`Airtable ${response.status} for ${path.split('?')[0]}`);
	return response.json();
}

async function queueItems(ids: string[]) {
	const table = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!table) throw new Error('AIRTABLE_CONTENTQUEUE_TABLE missing');
	const items = [];
	for (let index = 0; index < ids.length; index += 15) {
		const batch = ids.slice(index, index + 15);
		const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(',')})`;
		const payload = await airtableGet(`${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(formula)}&pageSize=20`) as { records?: AirtableRecord[] };
		for (const record of payload.records ?? []) {
			const fields = record.fields ?? {};
			items.push({
				id: record.id,
				platform: typeof fields.platform === 'string' ? fields.platform : undefined,
				status: typeof fields.status === 'string' ? fields.status : undefined,
				hook: typeof fields.hook === 'string' ? fields.hook : undefined,
				body: typeof fields.post_content === 'string' ? fields.post_content : undefined,
				createdTime: typeof fields.created_time === 'string' ? fields.created_time : record.createdTime,
			});
		}
	}
	return items;
}

async function main() {
	const admin = getSupabaseService();
	const { data: brains, error } = await admin.from('brand_brains').select('id,user_id,airtable_brand_id,identity');
	if (error) throw new Error(error.message);
	const folian = (brains ?? []).find((row) => row.airtable_brand_id === 'recampvDrWLSi3FrA');
	if (!folian) throw new Error('Folian brand brain was not found');
	const userId = String(folian.user_id);
	const table = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!table) throw new Error('AIRTABLE_BRANDPROFILES_TABLE missing');

	const profiles = [];
	for (const id of [CRISP_CANONICAL_AIRTABLE_ID, CRISP_RETAINED_PRODUCT_PROFILE_ID]) {
		const record = await airtableGet(`${encodeURIComponent(table)}/${id}`) as AirtableRecord;
		const fields = record.fields ?? {};
		profiles.push({
			id,
			clientName: String(fields.client_name ?? ''),
			ownerUserId: String(fields.user_id ?? ''),
			queueIds: [
				...(Array.isArray(fields.ContentQueue) ? fields.ContentQueue : []),
				...(Array.isArray(fields['ContentQueue 3']) ? fields['ContentQueue 3'] : []),
			].filter((value): value is string => typeof value === 'string'),
		});
	}
	const canonical = profiles.find((profile) => profile.id === CRISP_CANONICAL_AIRTABLE_ID);
	if (!canonical || canonical.ownerUserId !== userId) throw new Error('Canonical CrisP profile is not owned by the Folian user');

	const store = createSupabaseIntelligenceStore();
	const items = await queueItems([...new Set(canonical.queueIds)]);
	const activated = await activateLegacyBrand(store, {
		userId,
		airtableTable: table,
		profiles: profiles.map(({ id, clientName, ownerUserId }) => ({ id, clientName, ownerUserId })),
		selectedId: CRISP_CANONICAL_AIRTABLE_ID,
		reason: CRISP_RECONCILIATION_REASON,
		brain: { identity: crispIdentity, voice: crispVoice, guardrails: crispGuardrails, knowledge: crispKnowledge },
		representativeExample: {
			body: 'A digital marketing agency focused on customer experience. Specialisms stored on the profile: web design, performance marketing, and AI enablement.',
			whyItWorks: 'It is the profile overview, not a performance claim.',
		},
		strategy: {
			status: 'active',
			objectives: [
				'Build authority around practical digital marketing, AI enablement, and emerging advertising channels.',
				'Start qualified consulting conversations without inventing proof.',
			],
			audiences: [
				{ name: 'Founders without an internal marketing team', description: 'Stored audience: founders and owners who want to grow online and do not have internal marketing expertise.', problems: ['No time or team to run the work'], desiredOutcomes: ['A clear next conversation'] },
				{ name: 'Marketing leads at small and mid-sized businesses', problems: ['Need a partner rather than another tool tour'], desiredOutcomes: ['Practical channel and implementation choices'] },
			],
			audienceProblems: ['Marketing work is scattered across channels', 'AI claims are running ahead of proof'],
			desiredOutcomes: ['Authority that can start a consulting conversation', 'No fabricated case studies'],
			positioning: crispIdentity.positioning,
			keyMessages: [
				'CrisP Digital is a consultancy for web, performance marketing, and practical AI enablement.',
				'Listed services are not client results.',
				'Emerging channels, including ChatGPT advertising, stay questions until a dated source is stored.',
			],
			proofPoints: [],
			contentPillars: ['Practical AI enablement', 'Performance marketing', 'Web and customer experience', 'Emerging channels'],
			funnelStages: ['awareness', 'consideration'],
			ctaStrategy: { default: 'Invite a conversation about the specific channel or implementation. Do not invent a price or a scarcity claim.', linkedin: 'One concrete question or offer to talk.' },
			contentMix: { linkedin: 'primary', x: 'secondary, draft only' },
			editorialThemes: crispThemes.map((theme) => theme.title),
		},
		themes: crispThemes.map((theme) => ({
			title: theme.title,
			description: theme.description,
			objective: theme.objective,
			targetAudience: 'Founders and marketing leads at small and mid-sized businesses',
			relatedPillars: [...theme.relatedPillars],
			keyArguments: [...theme.keyArguments],
			subtopics: [],
			questionsToAnswer: [...theme.questionsToAnswer],
			proofPoints: [],
			keywords: ['crisp digital', 'ai enablement'],
			channels: ['linkedin'],
			status: 'active' as const,
		})),
		queueItems: items,
	});

	const mapped = await admin.from('airtable_entity_map').upsert({
		user_id: userId,
		airtable_table: table,
		airtable_record_id: CRISP_CANONICAL_AIRTABLE_ID,
		native_entity_type: 'brand_brain',
		native_entity_id: activated.brandId,
	}, { onConflict: 'airtable_table,airtable_record_id,native_entity_type' }).select('id').single();
	if (mapped.error) throw new Error(mapped.error.message);

	const strategy = await store.getStrategyForBrand(userId, activated.brandId);
	const linkedin = strategy?.channelStrategies.find((row) => row.channel === 'linkedin');
	await store.upsertChannelStrategy(userId, {
		id: linkedin?.id,
		strategyId: activated.strategyId,
		channel: 'linkedin',
		role: 'Primary authority channel for the consultancy',
		cadence: '3-4 times a week is the stored profile note, not a commitment',
		formats: ['company_post'],
		ctaNotes: 'Invite a conversation. No invented offer.',
		constraints: ['No unverified ChatGPT advertising facts', 'No client results'],
	});

	const { data: connections } = await admin.from('social_connections').select('provider,connection_type,brand_profile_id,account_name,expires_at').eq('user_id', userId);
	const { data: pages } = await admin.from('meta_pages').select('page_name,is_selected').eq('user_id', userId).eq('is_selected', true);
	const { data: instagram } = await admin.from('meta_instagram_accounts').select('ig_username,is_selected').eq('user_id', userId).eq('is_selected', true);
	const channels = auditBrandChannels({
		canonicalAirtableId: CRISP_CANONICAL_AIRTABLE_ID,
		nowIso: new Date().toISOString(),
		connections: (connections ?? []).map((row) => ({
			provider: String(row.provider),
			connectionType: row.connection_type ? String(row.connection_type) : null,
			brandProfileId: row.brand_profile_id ? String(row.brand_profile_id) : null,
			accountName: row.account_name ? String(row.account_name) : null,
			expiresAt: row.expires_at ? String(row.expires_at) : null,
		})),
		metaPageName: pages?.[0]?.page_name ? String(pages[0].page_name) : null,
		metaPageBrandScoped: false,
		instagramUsername: instagram?.[0]?.ig_username ? String(instagram[0].ig_username) : null,
		instagramBrandScoped: false,
		publicWebsite: 'https://www.crispdigital.io',
		publicXHandle: true,
	});

	const { data: credentials } = await admin.from('agent_credentials').select('id,name,scope,allowed_brand_ids,revoked_at');
	const owned = await store.listBrandBrains(userId);
	console.log(JSON.stringify({
		brandId: activated.brandId,
		airtableBrandId: activated.airtableBrandId,
		mappingId: mapped.data?.id ?? null,
		retainedIds: activated.retainedIds,
		strategyId: activated.strategyId,
		themeTitles: activated.themeTitles,
		memoryIngested: activated.memoryIngested,
		memorySkipped: activated.memorySkipped,
		queueFetched: items.length,
		channels,
		nativeBrands: owned.map((brain) => ({ id: brain.id, name: brain.identity.name, airtableBrandId: brain.airtableBrandId })),
		credentials: (credentials ?? []).map((row) => ({ id: row.id, name: row.name, scope: row.scope, allowedBrandIds: row.allowed_brand_ids, revoked: Boolean(row.revoked_at) })),
	}, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'activation failed');
	process.exit(1);
});
