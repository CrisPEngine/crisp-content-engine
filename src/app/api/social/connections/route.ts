import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncNativeSocialForUser, assignBrandDestination } from '@/lib/social/nativeSync';
import { channelFromPlatform, type PublishChannel } from '@/lib/social/channels';
import { brandChannelRows } from '@/lib/social/brandChannels';
import { listAccountAuthorizations } from '@/lib/social/brandChannels';
import { brandNameFromIdentity } from '@/lib/social/brandBrainName';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const url = new URL(request.url);
	const brandIdParam = url.searchParams.get('brandId');

	await syncNativeSocialForUser(user.id);

	const { data: authorizations } = await supabase
		.from('social_authorizations')
		.select('id, provider, provider_account_id, scopes, expires_at, status, created_at')
		.eq('owner_user_id', user.id)
		.order('created_at', { ascending: false });

	const authIds = (authorizations || []).map((a) => a.id);
	const { data: destinations } =
		authIds.length > 0
			? await supabase
					.from('social_destinations')
					.select(
						'id, authorization_id, provider, destination_type, provider_destination_id, display_name, handle, status'
					)
					.in('authorization_id', authIds)
			: { data: [] as never[] };

	const { data: brands } = await supabase.from('brand_brains').select('id, airtable_brand_id, identity').eq('user_id', user.id);

	const { data: brandLinks } = await supabase
		.from('brand_destinations')
		.select('brand_id, destination_id, purpose, enabled')
		.in('brand_id', (brands || []).map((b) => b.id));

	const accounts = await listAccountAuthorizations(user.id);

	return NextResponse.json({
		ok: true,
		authorizations: authorizations || [],
		destinations: destinations || [],
		brands: (brands || []).map((b) => ({
			id: b.id,
			airtableBrandId: b.airtable_brand_id,
			name: brandNameFromIdentity(b.identity),
		})),
		brandDestinations: brandLinks || [],
		brandChannels: brandIdParam ? await brandChannelRows(user.id, brandIdParam) : undefined,
		accounts,
	});
}

export async function POST(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const brandId = body.brandId as string | undefined;
	const destinationId = body.destinationId as string | undefined;
	const platform = body.platform as string | undefined;

	if (!brandId || !destinationId || !platform) {
		return NextResponse.json({ error: 'brandId, destinationId, and platform are required' }, { status: 400 });
	}

	const channel = channelFromPlatform(platform) as PublishChannel | null;
	if (!channel) {
		return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
	}

	try {
		await assignBrandDestination({
			userId: user.id,
			brandId,
			destinationId,
			channel,
		});
		return NextResponse.json({ ok: true });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to save destination';
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
