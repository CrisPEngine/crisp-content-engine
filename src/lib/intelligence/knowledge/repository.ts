import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import type { BrandBrain, BrandKnowledge } from '../types';
import type { ProductCapability } from '@/lib/articles/productKnowledge';
import {
	FOLIAN_SESSION_KEY,
	FOLIAN_SITE_URL,
	folianOfficialSiteDrafts,
	isFolianOfficialSite,
	type CatalogueDraft,
} from './folianOfficialSite';
import type { CapabilityAvailability } from '@/lib/articles/productKnowledge';
import type {
	AvailabilityStatus,
	KnowledgeProposal,
	KnowledgeSnapshot,
	StoredCapability,
	StoredClaim,
	StoredProduct,
	StoredSource,
} from './types';

function missingTable(error: { message?: string; code?: string } | null): boolean {
	const message = error?.message ?? '';
	return error?.code === '42P01' || /does not exist|schema cache/i.test(message);
}

function mapAvailability(value: AvailabilityStatus): CapabilityAvailability {
	if (value === 'discontinued') return 'deprecated';
	if (value === 'private_preview') return 'private_preview';
	return value;
}

function mapProposal(row: Record<string, unknown>): KnowledgeProposal {
	return {
		id: String(row.id),
		brandBrainId: String(row.brand_brain_id),
		sessionKey: String(row.session_key),
		recordType: row.record_type as KnowledgeProposal['recordType'],
		naturalKey: String(row.natural_key),
		payload: (row.payload as Record<string, unknown>) ?? {},
		status: row.status as KnowledgeProposal['status'],
		appliedRecordId: (row.applied_record_id as string | null) ?? null,
	};
}

export async function loadKnowledgeSnapshot(userId: string, brandBrainId: string): Promise<KnowledgeSnapshot> {
	const db = getSupabaseService();
	const [products, capabilities, claims, sources, proposals] = await Promise.all([
		db.from('brand_products').select('*').eq('user_id', userId).eq('brand_brain_id', brandBrainId),
		db.from('brand_capabilities').select('*').eq('user_id', userId).eq('brand_brain_id', brandBrainId),
		db.from('brand_claims').select('*').eq('user_id', userId).eq('brand_brain_id', brandBrainId),
		db.from('brand_evidence_sources').select('*').eq('user_id', userId).eq('brand_brain_id', brandBrainId),
		db.from('brand_knowledge_proposals').select('*').eq('user_id', userId).eq('brand_brain_id', brandBrainId),
	]);
	if ([products, capabilities, claims, sources, proposals].some((result) => missingTable(result.error))) {
		return { products: [], capabilities: [], claims: [], sources: [], proposals: [], available: false };
	}
	const failure = [products, capabilities, claims, sources, proposals].find((result) => result.error);
	if (failure?.error) throw new Error(failure.error.message);

	return {
		available: true,
		products: (products.data ?? []).map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description ?? '',
			category: row.category ?? '',
			availability: row.availability,
			lifecycleStatus: row.lifecycle_status,
			commercialModel: row.commercial_model,
			productUrl: row.product_url,
		})),
		capabilities: (capabilities.data ?? []).map((row) => ({
			id: row.id,
			productId: row.product_id,
			name: row.name,
			description: row.description ?? '',
			userBenefit: row.user_benefit,
			availability: row.availability,
			verificationStatus: row.verification_status,
			evidence: row.evidence,
			evidenceUrl: row.evidence_url,
			approvedLanguage: row.approved_language,
			limitations: row.limitations,
			prohibitedClaims: Array.isArray(row.prohibited_claims) ? row.prohibited_claims : [],
			lastVerified: row.last_verified,
		})),
		claims: (claims.data ?? []).map((row) => ({
			id: row.id,
			claimText: row.claim_text,
			approvedWording: row.approved_wording,
			verificationStatus: row.verification_status,
			approvalStatus: row.approval_status,
			prohibited: Boolean(row.prohibited),
			restrictions: row.restrictions,
		})),
		sources: (sources.data ?? []).map((row) => ({
			id: row.id,
			title: row.title,
			sourceType: row.source_type,
			url: row.url,
			trust: row.trust,
			reviewStatus: row.review_status,
			retrievedAt: row.retrieved_at,
		})),
		proposals: (proposals.data ?? []).map((row) => mapProposal(row as Record<string, unknown>)),
	};
}

export function draftsForBrand(brain: BrandBrain, suppliedText?: string): { sessionKey: string; drafts: CatalogueDraft[] } {
	if (suppliedText?.trim()) {
		const paragraphs = suppliedText
			.split(/\n+/)
			.map((line) => line.trim())
			.filter((line) => line.length > 40)
			.slice(0, 24);
		return {
			sessionKey: `supplied-text-${paragraphs.length}`,
			drafts: paragraphs.map((paragraph, index) => ({
				recordType: 'capability' as const,
				naturalKey: `supplied:${index + 1}:${paragraph.slice(0, 48).toLowerCase()}`,
				name: paragraph.slice(0, 80),
				description: paragraph,
				availability: 'unverified' as const,
				verificationStatus: 'verification_required' as const,
				evidence: 'Pasted by an operator. Not verified.',
				limitations: 'Source text alone does not establish that customers can use this.',
			})),
		};
	}
	if (isFolianOfficialSite(brain.identity.website)) {
		return { sessionKey: FOLIAN_SESSION_KEY, drafts: folianOfficialSiteDrafts() };
	}
	const services = (brain.identity.productsServices ?? []).map((item) => item.trim()).filter((item) => item && !item.startsWith('*') && item.length < 180);
	return {
		sessionKey: 'identity-products-services',
		drafts: services.map((name) => ({
			recordType: 'product' as const,
			naturalKey: `identity:${name.toLowerCase()}`,
			name,
			description: name,
			availability: 'unverified' as const,
			verificationStatus: 'verification_required' as const,
			evidence: 'Copied from the existing brand identity products and services list. Not newly verified.',
			category: 'listed service or product',
		})),
	};
}

export async function discoverKnowledge(userId: string, brain: BrandBrain, suppliedText?: string): Promise<KnowledgeProposal[]> {
	const db = getSupabaseService();
	const { sessionKey, drafts } = draftsForBrand(brain, suppliedText);
	let sourceId: string | null = null;
	if (isFolianOfficialSite(brain.identity.website) && !suppliedText?.trim()) {
		const existing = await db
			.from('brand_evidence_sources')
			.select('id')
			.eq('user_id', userId)
			.eq('brand_brain_id', brain.id)
			.eq('url', FOLIAN_SITE_URL)
			.maybeSingle();
		if (existing.error && !missingTable(existing.error)) throw new Error(existing.error.message);
		if (existing.data?.id) sourceId = existing.data.id;
		else if (!existing.error) {
			const inserted = await db
				.from('brand_evidence_sources')
				.insert({
					user_id: userId,
					brand_brain_id: brain.id,
					title: 'Folian public website',
					source_type: 'official_website',
					origin: 'https://folian.app',
					url: FOLIAN_SITE_URL,
					retrieved_at: '2026-11-13T00:00:00.000Z',
					trust: 'vendor_marketing',
					review_status: 'unreviewed',
				})
				.select('id')
				.single();
			if (inserted.error) throw new Error(inserted.error.message);
			sourceId = inserted.data.id;
		}
	}
	const existing = await db
		.from('brand_knowledge_proposals')
		.select('natural_key')
		.eq('user_id', userId)
		.eq('brand_brain_id', brain.id)
		.eq('session_key', sessionKey);
	if (existing.error) throw new Error(missingTable(existing.error) ? 'Brand knowledge tables are not available. Apply migration 040.' : existing.error.message);
	const seen = new Set((existing.data ?? []).map((row) => row.natural_key));
	const currentRows = await db
		.from('brand_knowledge_proposals')
		.select('id, natural_key, status, payload')
		.eq('user_id', userId)
		.eq('brand_brain_id', brain.id)
		.eq('session_key', sessionKey);
	if (currentRows.error) throw new Error(currentRows.error.message);
	for (const draft of drafts) {
		const current = (currentRows.data ?? []).find((row) => row.natural_key === draft.naturalKey);
		if (!current || current.status !== 'proposed') continue;
		const payload = (current.payload ?? {}) as CatalogueDraft & { customerDescription?: string };
		const refreshed = {
			...draft,
			customerDescription: payload.customerDescription,
			description: payload.customerDescription || draft.description,
		};
		await db.from('brand_knowledge_proposals').update({ payload: refreshed }).eq('id', current.id).eq('user_id', userId);
	}
	const rows = drafts
		.filter((draft) => !seen.has(draft.naturalKey))
		.map((draft) => ({
			user_id: userId,
			brand_brain_id: brain.id,
			session_key: sessionKey,
			record_type: draft.recordType,
			natural_key: draft.naturalKey,
			payload: draft,
			status: 'proposed',
			source_id: sourceId,
		}));
	if (!rows.length) {
		const current = await db.from('brand_knowledge_proposals').select('*').eq('user_id', userId).eq('brand_brain_id', brain.id).eq('session_key', sessionKey);
		if (current.error) throw new Error(current.error.message);
		return (current.data ?? []).map((row) => mapProposal(row as Record<string, unknown>));
	}
	const saved = await db.from('brand_knowledge_proposals').insert(rows).select('*');
	if (saved.error) throw new Error(saved.error.message);
	return (saved.data ?? []).map((row) => mapProposal(row as Record<string, unknown>));
}

export async function reviseProposalDescription(
	userId: string,
	brandBrainId: string,
	proposalId: string,
	customerDescription: string,
): Promise<void> {
	const description = customerDescription.trim();
	if (!description) throw new Error('The customer-facing description cannot be empty.');
	const db = getSupabaseService();
	const found = await db.from('brand_knowledge_proposals').select('id, status, payload').eq('id', proposalId).eq('user_id', userId).eq('brand_brain_id', brandBrainId).maybeSingle();
	if (found.error) throw new Error(found.error.message);
	if (!found.data) throw new Error('Proposal not found.');
	if (found.data.status === 'applied' || found.data.status === 'rejected') throw new Error('This proposal can no longer be edited here.');
	const payload = { ...(found.data.payload as Record<string, unknown>), customerDescription: description, description };
	const updated = await db.from('brand_knowledge_proposals').update({ payload }).eq('id', proposalId).eq('user_id', userId);
	if (updated.error) throw new Error(updated.error.message);
}

export async function decideProposals(
	userId: string,
	brandBrainId: string,
	ids: string[],
	status: 'approved' | 'rejected' | 'deferred',
): Promise<number> {
	if (!ids.length) return 0;
	const db = getSupabaseService();
	const updated = await db
		.from('brand_knowledge_proposals')
		.update({ status, decided_at: new Date().toISOString() })
		.eq('user_id', userId)
		.eq('brand_brain_id', brandBrainId)
		.in('id', ids)
		.in('status', ['proposed', 'approved', 'deferred'])
		.select('id');
	if (updated.error) throw new Error(updated.error.message);
	return updated.data?.length ?? 0;
}

function capabilityFromDraft(draft: CatalogueDraft, productId: string | null): Record<string, unknown> {
	return {
		product_id: productId,
		name: draft.name,
		description: draft.description,
		availability: draft.availability,
		verification_status: draft.verificationStatus === 'verified' ? 'verification_required' : draft.verificationStatus,
		evidence: draft.evidence,
		evidence_url: draft.evidence.includes('folian.app') ? FOLIAN_SITE_URL : null,
		limitations: draft.limitations ?? null,
		approved_language: null,
		prohibited_claims: draft.prohibited ? [draft.description] : [],
	};
}

async function upsertByNaturalKey(
	db: ReturnType<typeof getSupabaseService>,
	table: 'brand_products' | 'brand_capabilities' | 'brand_claims',
	userId: string,
	brandBrainId: string,
	naturalKey: string,
	fields: Record<string, unknown>,
): Promise<string> {
	const found = await db.from(table).select('id').eq('user_id', userId).eq('brand_brain_id', brandBrainId).eq('natural_key', naturalKey).maybeSingle();
	if (found.error) throw new Error(found.error.message);
	if (found.data?.id) {
		const patch = { ...fields };
		delete patch.verification_status;
		const updated = await db.from(table).update(patch).eq('id', found.data.id).eq('user_id', userId).select('id').single();
		if (updated.error) throw new Error(updated.error.message);
		return updated.data.id;
	}
	const inserted = await db.from(table).insert({ user_id: userId, brand_brain_id: brandBrainId, natural_key: naturalKey, ...fields }).select('id').single();
	if (inserted.error) throw new Error(inserted.error.message);
	return inserted.data.id;
}

export async function applyApprovedProposals(userId: string, brain: BrandBrain, ids?: string[]): Promise<{ applied: number }> {
	const db = getSupabaseService();
	let query = db
		.from('brand_knowledge_proposals')
		.select('*')
		.eq('user_id', userId)
		.eq('brand_brain_id', brain.id)
		.eq('status', 'approved');
	if (ids?.length) query = query.in('id', ids);
	const selected = await query;
	if (selected.error) throw new Error(selected.error.message);
	const proposals = (selected.data ?? []) as Array<Record<string, unknown>>;
	let applied = 0;
	for (const proposal of proposals) {
		const draft = proposal.payload as CatalogueDraft;
		let recordId: string | null = null;
		if (draft.recordType === 'product') {
			recordId = await upsertByNaturalKey(db, 'brand_products', userId, brain.id, draft.naturalKey, {
				name: draft.name,
				description: draft.description,
				category: draft.category ?? null,
				commercial_model: draft.commercialModel ?? null,
				availability: draft.availability,
				lifecycle_status: draft.availability,
			});
		} else if (draft.recordType === 'capability') {
			recordId = await upsertByNaturalKey(db, 'brand_capabilities', userId, brain.id, draft.naturalKey, capabilityFromDraft(draft, null));
		} else if (draft.recordType === 'claim') {
			recordId = await upsertByNaturalKey(db, 'brand_claims', userId, brain.id, draft.naturalKey, {
				claim_text: draft.description,
				category: draft.category ?? null,
				verification_status: draft.verificationStatus === 'verified' ? 'verification_required' : draft.verificationStatus,
				approval_status: 'approved',
				approved_wording: draft.prohibited ? null : null,
				prohibited: Boolean(draft.prohibited),
				restrictions: draft.limitations ?? null,
			});
		}
		await db
			.from('brand_knowledge_proposals')
			.update({ status: 'applied', applied_record_id: recordId, decided_at: new Date().toISOString() })
			.eq('id', proposal.id)
			.eq('user_id', userId);
		await db.from('brand_knowledge_events').insert({
			user_id: userId,
			brand_brain_id: brain.id,
			action: 'applied_proposal',
			record_type: draft.recordType,
			record_id: recordId,
			before_state: null,
			after_state: draft,
			note: 'Applied from an approved proposal. No model call.',
		});
		applied += 1;
	}
	if (applied) await projectCapabilities(userId, brain);
	return { applied };
}

export async function setCapabilityVerification(
	userId: string,
	brain: BrandBrain,
	ids: string[],
	verificationStatus: StoredCapability['verificationStatus'],
): Promise<number> {
	if (!ids.length) return 0;
	const db = getSupabaseService();
	const current = await db.from('brand_capabilities').select('*').eq('user_id', userId).eq('brand_brain_id', brain.id).in('id', ids);
	if (current.error) throw new Error(current.error.message);
	const rows = current.data ?? [];
	if (verificationStatus === 'verified') {
		const missing = rows.filter((row) => !String(row.evidence ?? '').trim());
		if (missing.length) throw new Error('A capability needs recorded evidence before it can be verified.');
	}
	const today = new Date().toISOString().slice(0, 10);
	let updated = 0;
	for (const row of rows) {
		if (row.verification_status === verificationStatus) continue;
		const next = await db
			.from('brand_capabilities')
			.update({
				verification_status: verificationStatus,
				last_verified: verificationStatus === 'verified' ? today : row.last_verified,
			})
			.eq('id', row.id)
			.eq('user_id', userId)
			.select('id')
			.single();
		if (next.error) throw new Error(next.error.message);
		await db.from('brand_knowledge_events').insert({
			user_id: userId,
			brand_brain_id: brain.id,
			action: 'verification_changed',
			record_type: 'capability',
			record_id: row.id,
			before_state: { verificationStatus: row.verification_status, evidence: row.evidence, lastVerified: row.last_verified },
			after_state: { verificationStatus, evidence: row.evidence, lastVerified: verificationStatus === 'verified' ? today : row.last_verified },
			note: 'Verification is separate from proposal approval. No model call.',
		});
		updated += 1;
	}
	if (updated) await projectCapabilities(userId, brain);
	return updated;
}

export function capabilitiesToProductRecords(rows: StoredCapability[]): ProductCapability[] {
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		availability: mapAvailability(row.availability),
		evidence: row.evidence ?? undefined,
		lastVerified: row.lastVerified,
		limitations: row.limitations ?? undefined,
		approvedLanguage: row.approvedLanguage ?? undefined,
		prohibitedClaims: row.prohibitedClaims,
		productUrl: row.evidenceUrl ?? undefined,
		verificationStatus: row.verificationStatus,
	}));
}

async function projectCapabilities(userId: string, brain: BrandBrain): Promise<void> {
	const snapshot = await loadKnowledgeSnapshot(userId, brain.id);
	const knowledge: BrandKnowledge = {
		...brain.knowledge,
		capabilities: capabilitiesToProductRecords(snapshot.capabilities),
	};
	const db = getSupabaseService();
	await db.from('brand_brains').update({ knowledge }).eq('id', brain.id).eq('user_id', userId);
}

export function countsFromSnapshot(snapshot: KnowledgeSnapshot) {
	const pending = snapshot.proposals.filter((item) => item.status === 'proposed' || item.status === 'approved' || item.status === 'deferred');
	return {
		products: snapshot.products.length,
		verifiedCapabilities: snapshot.capabilities.filter((item) => item.verificationStatus === 'verified').length,
		unverifiedCapabilities: snapshot.capabilities.filter((item) => item.verificationStatus !== 'verified').length,
		pendingProposals: pending.length,
		sourcesNeedingReview: snapshot.sources.filter((item) => item.reviewStatus !== 'accepted').length,
		tablesAvailable: snapshot.available,
	};
}

export type { StoredProduct, StoredClaim, StoredSource };
