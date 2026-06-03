import { OperatorActionError } from '../actions/errors';
import type {
	AdapterResult,
	BrandProfileAdapter,
	BrandRecord,
	ContentQueueAdapter,
	ContentRecord,
} from './types';
import type {
	CreateOrUpdateBrandProfileInput,
	FetchBrandContentQueueInput,
	ScheduleApprovedContentInput,
	SendItemToApprovalInput,
	UpdateContentStatusInput,
} from '../actions/schemas';

const BRAND_FIELDS = [
	'brand_type',
	'client_name',
	'website',
	'audience',
	'value_props',
	'offers',
	'brand_goals',
	'voice_rules',
	'brand_keywords',
	'exclude_keywords',
	'content_rules',
	'additional_info',
	'platforms_requested',
	'timezone',
	'language_region',
	'preferred_image_source',
	'brand_palette',
	'approval_contact_email',
	'strategy_json',
	'strategy_payload',
	'strategy_summary',
	'brand_assets',
	'personal_full_name',
	'personal_job_title',
	'personal_industry',
	'personal_links',
	'personal_headline',
	'personal_audience',
	'personal_expertise',
	'personal_goals',
	'personal_voice_traits',
	'personal_tone_avoid',
	'personal_risk_tolerance',
	'personal_content_style',
	'personal_exclude_keywords',
	'personal_story',
	'personal_assets',
	'status',
	'strategy_approval',
	'user_id',
];

const CONTENT_FIELDS = [
	'platform',
	'status',
	'hook',
	'post_content',
	'hashtags',
	'scheduled_time',
	'brand_profile_id',
	'image_prompt',
	'created_time',
	'last_modified',
	'published_at',
	'image_reference_url',
	'image_generation_source',
	'call_to_action',
	'publish_text',
];

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new OperatorActionError(`${name} is not configured`, {
			status: 500,
			code: 'operator_missing_env',
			details: { env: name },
		});
	}
	return value;
}

function stripUndefined<T extends Record<string, unknown>>(fields: T) {
	return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function escapeAirtableString(value: string) {
	return value.replace(/"/g, '""');
}

function firstLinkedRecord(value: unknown): string | null {
	if (!value) return null;
	if (Array.isArray(value)) {
		const first = value[0];
		if (!first) return null;
		if (typeof first === 'string') return first;
		const linked = first as { id?: unknown };
		return linked.id ? String(linked.id) : String(first);
	}
	if (typeof value === 'string') return value;
	if (typeof value === 'object') {
		const linked = value as { id?: unknown };
		if (linked.id) return String(linked.id);
	}
	return null;
}

function mapBrandProfileToFields(input: CreateOrUpdateBrandProfileInput) {
	const profile = input.profile;
	const brandAssets = profile.brand_assets_urls?.map((url) => ({ url }));
	const personalAssets = profile.personal_assets_urls?.map((url) => ({ url }));

	return stripUndefined({
		brand_type: profile.brand_type,
		client_name: profile.brand_type === 'personal'
			? profile.personal_full_name ?? profile.client_name ?? ''
			: profile.client_name,
		website: profile.website,
		audience: profile.brand_type === 'personal' ? profile.personal_audience : profile.audience,
		value_props: profile.brand_type === 'personal' ? profile.personal_expertise : profile.value_props,
		offers: profile.brand_type === 'personal' ? '' : profile.offers,
		brand_goals: profile.brand_type === 'personal' ? profile.personal_goals : profile.brand_goals,
		voice_rules: profile.voice_rules,
		brand_keywords: profile.brand_keywords,
		exclude_keywords: profile.exclude_keywords,
		content_rules: profile.content_rules,
		additional_info: profile.additional_info,
		platforms_requested: profile.platforms_requested,
		timezone: profile.timezone,
		language_region: profile.language_region,
		preferred_image_source: profile.preferred_image_source,
		brand_palette: profile.brand_palette,
		approval_contact_email: profile.approval_contact_email,
		brand_assets: brandAssets && brandAssets.length > 0 ? brandAssets : undefined,
		personal_full_name: profile.personal_full_name,
		personal_job_title: profile.personal_job_title,
		personal_industry: profile.personal_industry,
		personal_links: profile.personal_links,
		personal_headline: profile.personal_headline,
		personal_audience: profile.personal_audience,
		personal_expertise: profile.personal_expertise,
		personal_goals: profile.personal_goals,
		personal_voice_traits: profile.personal_voice_traits,
		personal_tone_avoid: profile.personal_tone_avoid,
		personal_risk_tolerance: profile.personal_risk_tolerance,
		personal_content_style: profile.personal_content_style,
		personal_exclude_keywords: profile.personal_exclude_keywords,
		personal_story: profile.personal_story,
		personal_assets: personalAssets && personalAssets.length > 0 ? personalAssets : undefined,
		status: profile.status ?? (input.brandProfileId ? undefined : 'New Brief'),
		strategy_approval: profile.strategy_approval ?? (input.brandProfileId ? undefined : false),
		user_id: input.userId,
	});
}

function mapContentRecord(record: ContentRecord) {
	const fields = record.fields || {};
	const brandProfileId = firstLinkedRecord(fields.brand_profile_id);

	return {
		id: record.id,
		title: fields.hook || 'Untitled',
		platform: fields.platform || 'Blog',
		status: fields.status || 'Draft',
		scheduled_time: fields.scheduled_time || null,
		published_at: fields.published_at || null,
		brand_profile_id: brandProfileId,
		content: fields.post_content || '',
		hashtags: fields.hashtags || '',
		image_prompt: fields.image_prompt || '',
		image_generation_source: fields.image_generation_source || '',
		image_reference_url: fields.image_reference_url || '',
		call_to_action: fields.call_to_action || '',
		publish_text: fields.publish_text || '',
		created_time: fields.created_time || record.createdTime || null,
		updated_time: fields.last_modified || null,
	};
}

export class AirtableOperatorAdapter implements BrandProfileAdapter, ContentQueueAdapter {
	private get brandProfilesTable() {
		return requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	}

	private get contentQueueTable() {
		return requireEnv('AIRTABLE_CONTENTQUEUE_TABLE');
	}

	async createOrUpdateBrandProfile(input: CreateOrUpdateBrandProfileInput, dryRun: boolean): Promise<AdapterResult> {
		const fields = mapBrandProfileToFields(input);
		const operation = input.brandProfileId ? 'update' : 'create';

		if (dryRun) {
			return {
				provider: 'airtable',
				recordId: input.brandProfileId,
				payload: { operation, table: this.brandProfilesTable, fields },
				message: `Dry run: would ${operation} brand profile`,
			};
		}

		const { createRecord, updateRecord } = await import('@/lib/airtable/client');
		const record = input.brandProfileId
			? await updateRecord({ table: this.brandProfilesTable, recordId: input.brandProfileId, fields })
			: await createRecord({ table: this.brandProfilesTable, fields });

		return {
			provider: 'airtable',
			recordId: record.id,
			response: record,
			message: `Brand profile ${operation}d`,
		};
	}

	async getBrandProfile(brandProfileId: string): Promise<BrandRecord> {
		const { getRecord } = await import('@/lib/airtable/client');
		return getRecord({
			table: this.brandProfilesTable,
			recordId: brandProfileId,
			fields: BRAND_FIELDS,
		});
	}

	async getContentItem(contentId: string): Promise<ContentRecord> {
		const { getRecord } = await import('@/lib/airtable/client');
		return getRecord({
			table: this.contentQueueTable,
			recordId: contentId,
			fields: CONTENT_FIELDS,
		});
	}

	async updateContentStatus(input: UpdateContentStatusInput, dryRun: boolean): Promise<AdapterResult> {
		const fields = stripUndefined({
			status: input.status,
			scheduled_time: input.scheduledTime,
			approved_at: input.status === 'Ready To Publish' ? new Date().toISOString() : undefined,
			published_at: input.status === 'Published' ? new Date().toISOString() : undefined,
		});

		if (dryRun) {
			return {
				provider: 'airtable',
				recordId: input.contentId,
				payload: { table: this.contentQueueTable, fields },
				message: 'Dry run: would update content status',
			};
		}

		const { updateRecord } = await import('@/lib/airtable/client');
		const record = await updateRecord({
			table: this.contentQueueTable,
			recordId: input.contentId,
			fields,
		});

		return {
			provider: 'airtable',
			recordId: record.id,
			response: record,
			message: 'Content status updated',
		};
	}

	async sendItemToApproval(input: SendItemToApprovalInput, dryRun: boolean): Promise<AdapterResult> {
		return this.updateContentStatus(
			{ contentId: input.contentId, status: 'Needs Approval', notes: input.notes },
			dryRun
		);
	}

	async scheduleApprovedContent(input: ScheduleApprovedContentInput, dryRun: boolean): Promise<AdapterResult> {
		return this.updateContentStatus(
			{ contentId: input.contentId, status: 'Scheduled', scheduledTime: input.scheduledTime },
			dryRun
		);
	}

	async fetchBrandContentQueue(input: FetchBrandContentQueueInput) {
		const filters: string[] = [];
		if (input.brandProfileId) {
			filters.push(`FIND("${escapeAirtableString(input.brandProfileId)}", ARRAYJOIN({brand_profile_id}, ",")) > 0`);
		}
		if (input.statuses && input.statuses.length > 0) {
			const statusFilter = input.statuses.length === 1
				? `{status} = "${escapeAirtableString(input.statuses[0])}"`
				: `OR(${input.statuses.map((status) => `{status} = "${escapeAirtableString(status)}"`).join(',')})`;
			filters.push(statusFilter);
		}

		const { listRecords } = await import('@/lib/airtable/client');
		const records = await listRecords({
			table: this.contentQueueTable,
			filterByFormula: filters.length > 0 ? `AND(${filters.join(',')})` : undefined,
			sort: [{ field: 'created_time', direction: 'desc' }],
			pageSize: Math.min(input.limit ?? 50, 100),
			maxRecords: input.limit ?? 50,
			fields: CONTENT_FIELDS,
			returnFieldsByFieldId: false,
			endpoint: '/api/operator/actions',
		});

		return {
			provider: 'airtable' as const,
			items: records.map(mapContentRecord),
			response: { count: records.length },
			message: 'Content queue fetched',
		};
	}
}
