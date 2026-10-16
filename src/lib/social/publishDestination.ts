import { getSupabaseService } from '@/lib/supabaseService';
import { resolvePublishDestination, type ResolveInput, type ResolvedPublishDestination } from './resolveDestination';

export class PublishDestinationMissingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PublishDestinationMissingError';
	}
}

async function missingDestinationMessage(input: ResolveInput): Promise<string> {
	const admin = getSupabaseService();
	const trimmed = input.airtableBrandId?.trim();
	let brandLabel = trimmed || 'this brand';
	if (trimmed) {
		const { data: byAirtable } = await admin
			.from('brand_brains')
			.select('identity')
			.eq('user_id', input.userId)
			.eq('airtable_brand_id', trimmed)
			.maybeSingle();
		const { data: byId } = byAirtable
			? { data: byAirtable }
			: await admin.from('brand_brains').select('identity').eq('user_id', input.userId).eq('id', trimmed).maybeSingle();
		const name = (byId?.identity as { name?: string } | undefined)?.name;
		if (name?.trim()) brandLabel = name.trim();
	}
	const platform = input.platform?.trim() || 'channel';
	return `No destination connected for ${brandLabel} ${platform}. Assign a channel in Connections.`;
}

export async function requirePublishDestination(input: ResolveInput): Promise<ResolvedPublishDestination> {
	const resolved = await resolvePublishDestination(input);
	if (resolved) return resolved;
	throw new PublishDestinationMissingError(await missingDestinationMessage(input));
}
