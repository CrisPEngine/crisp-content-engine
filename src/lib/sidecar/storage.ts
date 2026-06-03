import 'server-only';

import { createRecord } from '@/lib/airtable/client';
import { getSupabaseService } from '@/lib/supabaseService';
import type { z } from 'zod';
import { SidecarError } from './errors';
import type {
	sidecarContactRequestSchema,
	sidecarContentIdeaRequestSchema,
	sidecarOpportunityRequestSchema,
} from './schemas';

type OpportunityInput = z.infer<typeof sidecarOpportunityRequestSchema>;
type ContactInput = z.infer<typeof sidecarContactRequestSchema>;
type ContentIdeaInput = z.infer<typeof sidecarContentIdeaRequestSchema>;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new SidecarError(`${name} is not configured`, {
			status: 500,
			code: 'sidecar_missing_env',
			details: { env: name },
		});
	}
	return value;
}

export async function saveSidecarOpportunity(
	userId: string,
	input: OpportunityInput,
): Promise<{ id: string }> {
	const admin = getSupabaseService();
	const status = input.status || (input.draftText ? 'Drafted' : 'Captured');
	const tags = input.tags?.length ? input.tags : input.suggestedTags;

	const { data, error } = await admin
		.from('sidecar_engagement_opportunities')
		.insert({
			user_id: userId,
			brand_profile_id: input.brandId || null,
			brand: input.brand,
			platform: input.platform,
			page_url: input.pageUrl || null,
			page_title: input.pageTitle || null,
			source_text: input.sourceText || null,
			source_author: input.sourceAuthor || null,
			source_handle: input.sourceHandle || null,
			source_profile_url: input.sourceProfileUrl || null,
			message_type: input.messageType,
			objective: input.objective,
			cta_strength: input.ctaStrength,
			relationship_stage: input.relationshipStage,
			fit_score: input.fitScore ?? null,
			opportunity_summary: input.opportunitySummary || null,
			draft_text: input.draftText || null,
			short_alternative: input.shortAlternative || null,
			recommended_action: input.recommendedAction || null,
			cta_recommendation: input.ctaRecommendation || null,
			link_recommendation: input.linkRecommendation || null,
			risk_notes: input.riskNotes || null,
			suggested_follow_up: input.suggestedFollowUp || null,
			suggested_tags: tags || [],
			status,
			outcome: input.outcome || 'None',
			notes: input.notes || null,
		})
		.select('id')
		.single();

	if (error) {
		throw new SidecarError('Failed to save opportunity', {
			status: 500,
			code: 'sidecar_opportunity_save_failed',
			details: error,
		});
	}

	await logSidecarUsage({
		userId,
		brand: input.brand,
		platform: input.platform,
		action: 'opportunity_saved',
		messageType: input.messageType,
		objective: input.objective,
	}).catch(() => {});

	return { id: data.id };
}

export async function saveSidecarContact(
	userId: string,
	input: ContactInput,
): Promise<{ id: string; updated: boolean }> {
	const admin = getSupabaseService();
	const brandProfileId = input.brandId || null;
	const handle = input.handle?.trim() || null;

	const row = {
		user_id: userId,
		brand_profile_id: brandProfileId,
		brand: input.brand,
		name: input.name || null,
		handle,
		platform: input.platform,
		profile_url: input.profileUrl || null,
		website: input.website || null,
		email: input.email || null,
		phone: input.phone || null,
		organisation: input.organisation || null,
		country: input.country || null,
		contact_type: input.contactType,
		relationship_stage: input.relationshipStage,
		consent_status: input.consentStatus,
		source_url: input.sourceUrl || null,
		source_context: input.sourceContext || null,
		notes: input.notes || null,
		tags: input.tags || [],
		next_action: input.nextAction || null,
		follow_up_date: input.followUpDate || null,
	};

	if (handle && brandProfileId) {
		const { data: existing } = await admin
			.from('sidecar_contacts')
			.select('id')
			.eq('user_id', userId)
			.eq('brand_profile_id', brandProfileId)
			.eq('platform', input.platform)
			.eq('handle', handle)
			.maybeSingle();

		if (existing?.id) {
			const { data, error } = await admin
				.from('sidecar_contacts')
				.update(row)
				.eq('id', existing.id)
				.select('id')
				.single();

			if (error) {
				throw new SidecarError('Failed to update contact', {
					status: 500,
					code: 'sidecar_contact_update_failed',
					details: error,
				});
			}

			await logSidecarUsage({
				userId,
				brand: input.brand,
				platform: input.platform,
				action: 'contact_updated',
			}).catch(() => {});

			return { id: data.id, updated: true };
		}
	}

	const { data, error } = await admin
		.from('sidecar_contacts')
		.insert(row)
		.select('id')
		.single();

	if (error) {
		throw new SidecarError('Failed to save contact', {
			status: 500,
			code: 'sidecar_contact_save_failed',
			details: error,
		});
	}

	await logSidecarUsage({
		userId,
		brand: input.brand,
		platform: input.platform,
		action: 'contact_saved',
	}).catch(() => {});

	return { id: data.id, updated: false };
}

function isAirtableUnknownFieldError(error: unknown, fieldName: string): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message;
	if (!message.includes('UNKNOWN_FIELD_NAME') && !message.includes('INVALID_VALUE_FOR_COLUMN')) {
		return false;
	}
	return message.includes(fieldName);
}

async function createContentQueueRecord(
	table: string,
	fields: Record<string, unknown>,
): Promise<{ id: string }> {
	try {
		const record = await createRecord({ table, fields });
		return { id: record.id as string };
	} catch (error) {
		if ('generated_from' in fields && isAirtableUnknownFieldError(error, 'generated_from')) {
			const withoutGeneratedFrom = { ...fields };
			delete withoutGeneratedFrom.generated_from;
			const record = await createRecord({ table, fields: withoutGeneratedFrom });
			return { id: record.id as string };
		}
		throw error;
	}
}

export async function createSidecarContentIdea(
	userId: string,
	input: ContentIdeaInput,
): Promise<{ airtableRecordId: string }> {
	const table = requireEnv('AIRTABLE_CONTENTQUEUE_TABLE');

	const bodyParts = [
		input.suggestedAngle,
		input.notes,
		input.selectedText ? `Source:\n${input.selectedText}` : null,
		input.sourceUrl || input.pageUrl ? `URL: ${input.sourceUrl || input.pageUrl}` : null,
	]
		.filter(Boolean)
		.join('\n\n');

	const record = await createContentQueueRecord(table, {
		hook: input.suggestedHook || input.suggestedTitle,
		post_content: bodyParts || input.suggestedTitle,
		platform: input.platform,
		status: 'Draft',
		brand_profile_id: [input.brandId],
		objective: input.objective || '',
		campaign_name: `Sidecar: ${input.topicBucket || input.suggestedTitle}`.slice(0, 200),
		generated_from: 'sidecar',
	});

	await logSidecarUsage({
		userId,
		brand: input.brand,
		platform: input.platform,
		action: 'content_idea_created',
		metadata: { airtableRecordId: record.id },
	}).catch(() => {});

	return { airtableRecordId: record.id };
}

export async function logSidecarUsage(options: {
	userId: string;
	brand?: string;
	platform?: string;
	action: string;
	messageType?: string;
	objective?: string;
	metadata?: Record<string, unknown>;
}): Promise<void> {
	const admin = getSupabaseService();
	await admin.from('sidecar_usage_events').insert({
		user_id: options.userId,
		brand: options.brand || null,
		platform: options.platform || null,
		action: options.action,
		message_type: options.messageType || null,
		objective: options.objective || null,
		metadata_json: options.metadata || {},
	});
}
