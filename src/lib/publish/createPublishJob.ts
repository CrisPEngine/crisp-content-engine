import { getSupabaseService } from '@/lib/supabaseService';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { DESTINATION_TYPES } from '@/lib/social/providers';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';

type PublishPlatform = 'facebook' | 'instagram' | 'threads';

async function queuePublishJob(input: {
	userId: string;
	contentId: string;
	record: { fields?: Record<string, unknown> };
	platform: PublishPlatform;
	airtablePlatformLabel: 'Facebook' | 'Instagram' | 'Threads';
}) {
	const admin = getSupabaseService();
	const { userId, contentId, record, platform, airtablePlatformLabel } = input;

	const brandProfileId = Array.isArray(record.fields?.brand_profile_id)
		? (record.fields.brand_profile_id as string[])[0]
		: (record.fields?.brand_profile_id as string | undefined);

	if (!brandProfileId) throw new Error('Missing brand_profile_id');

	const contentItemKey = (record.fields?.content_item_key as string) || contentId;

	const resolved = await resolvePublishDestination({
		userId,
		airtableBrandId: brandProfileId,
		platform: airtablePlatformLabel,
	});

	if (!resolved) {
		throw new Error(`No ${platform} destination for this brand. Assign a channel in Connections.`);
	}

	const targetId = resolved.providerDestinationId;

	if (platform === 'facebook') {
		const { data: page } = await admin
			.from('meta_pages')
			.select('page_access_token_encrypted')
			.eq('user_id', userId)
			.eq('page_id', targetId)
			.maybeSingle();
		if (!page?.page_access_token_encrypted && resolved.source === 'legacy') {
			throw new Error('Facebook Page token is missing. Please reconnect your Meta account.');
		}
	} else if (platform === 'instagram') {
		const isNativeLogin =
			resolved.source === 'native' &&
			resolved.destinationId &&
			(await admin
				.from('social_destinations')
				.select('destination_type')
				.eq('id', resolved.destinationId)
				.maybeSingle()
				.then((r) => r.data?.destination_type === DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL));

		if (!isNativeLogin) {
			const { data: igAccount } = await admin
				.from('meta_instagram_accounts')
				.select('connected_page_id')
				.eq('user_id', userId)
				.eq('ig_user_id', targetId)
				.maybeSingle();
			if (!igAccount) {
				throw new Error('Instagram account not found. Connect Meta and assign a destination.');
			}
			const { data: page } = await admin
				.from('meta_pages')
				.select('page_access_token_encrypted')
				.eq('user_id', userId)
				.eq('page_id', igAccount.connected_page_id)
				.maybeSingle();
			if (!page?.page_access_token_encrypted) {
				throw new Error('Connected Facebook Page token is missing. Please reconnect Meta.');
			}
		} else {
			const secrets = resolved.authorizationId ? await getAuthorizationSecrets(resolved.authorizationId) : null;
			if (!secrets?.accessToken) {
				throw new Error('Instagram Login token is missing. Reconnect Instagram from Connections.');
			}
		}
	} else if (platform === 'threads') {
		const secrets = resolved.authorizationId ? await getAuthorizationSecrets(resolved.authorizationId) : null;
		if (!secrets?.accessToken) {
			throw new Error('Threads token is missing. Reconnect Threads from Connections.');
		}
	}

	const hook = (record.fields?.hook as string) || (record.fields?.title as string) || '';
	const postContent = (record.fields?.post_content as string) || '';
	const hashtags = (record.fields?.hashtags as string) || '';
	const bodyParts: string[] = [];
	if (hook) bodyParts.push(hook);
	if (postContent) bodyParts.push(postContent);
	const baseText = bodyParts.join('\n\n');
	const fullText = hashtags ? `${baseText}\n\n${hashtags}` : baseText;
	const imageUrl = (record.fields?.image_reference_url as string) || null;
	const videoUrl = (record.fields?.video_reference_url as string) || null;

	const payload = {
		text: fullText,
		imageUrl,
		videoUrl,
		contentItemKey,
		platform,
		targetId,
		destinationId: resolved.destinationId,
		createdAt: new Date().toISOString(),
	};

	const rawScheduledTime = record.fields?.scheduled_time;
	let scheduledTime = rawScheduledTime ? new Date(String(rawScheduledTime)) : new Date();
	const now = new Date();
	if (scheduledTime < now) scheduledTime = now;

	const { data: recentJobs } = await admin
		.from('publish_jobs')
		.select('scheduled_time')
		.eq('platform', platform)
		.eq('target_id', targetId)
		.order('scheduled_time', { ascending: false })
		.limit(1);

	if (recentJobs?.length) {
		const lastScheduledTime = new Date(recentJobs[0].scheduled_time);
		const sixtySecondsAfterLast = new Date(lastScheduledTime.getTime() + 60 * 1000);
		if (scheduledTime < sixtySecondsAfterLast) scheduledTime = sixtySecondsAfterLast;
	}

	const { error: insertError } = await admin.from('publish_jobs').insert({
		user_id: userId,
		brand_profile_id: brandProfileId,
		content_item_key: contentItemKey,
		platform,
		target_id: targetId,
		status: 'queued',
		scheduled_time: scheduledTime.toISOString(),
		payload_json: payload,
		airtable_record_id: contentId,
	});

	if (insertError) {
		if (insertError.code === '23505') return;
		throw new Error(`Failed to create publish job: ${insertError.message}`);
	}
}

export async function createMetaPublishJob(
	userId: string,
	contentId: string,
	record: { fields?: Record<string, unknown> },
	platform: 'facebook' | 'instagram'
) {
	return queuePublishJob({
		userId,
		contentId,
		record,
		platform,
		airtablePlatformLabel: platform === 'facebook' ? 'Facebook' : 'Instagram',
	});
}

export async function createThreadsPublishJob(userId: string, contentId: string, record: { fields?: Record<string, unknown> }) {
	return queuePublishJob({
		userId,
		contentId,
		record,
		platform: 'threads',
		airtablePlatformLabel: 'Threads',
	});
}
