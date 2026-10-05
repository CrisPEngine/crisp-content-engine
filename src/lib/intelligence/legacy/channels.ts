export type ChannelAvailability =
	| 'CONNECTED_AND_AUTHORIZED'
	| 'CONNECTED_BUT_UNVERIFIED'
	| 'SUPPORTED_NOT_CONNECTED'
	| 'NOT_IMPLEMENTED';

export type ChannelAudit = {
	channel: string;
	state: ChannelAvailability;
	note: string;
};

export type StoredConnection = {
	provider: string;
	connectionType?: string | null;
	brandProfileId?: string | null;
	accountName?: string | null;
	expiresAt?: string | null;
};

/**
 * Classify connections for one canonical BrandProfile.
 * A connection assigned to a different profile, or an expired token, is not authorized for this brand.
 */
export function auditBrandChannels(input: {
	canonicalAirtableId: string;
	nowIso: string;
	connections: StoredConnection[];
	metaPageName?: string | null;
	metaPageBrandScoped?: boolean;
	instagramUsername?: string | null;
	instagramBrandScoped?: boolean;
	publicWebsite?: string | null;
	publicXHandle?: boolean;
}): ChannelAudit[] {
	const now = Date.parse(input.nowIso);
	const linkedin = input.connections.filter((row) => row.provider === 'linkedin');
	const assigned = linkedin.find((row) => row.brandProfileId === input.canonicalAirtableId);
	const expires = assigned?.expiresAt ? Date.parse(assigned.expiresAt) : NaN;
	const assignedCurrent = assigned && Number.isFinite(expires) && expires > now;
	let linkedinState: ChannelAudit;
	if (assignedCurrent) {
		linkedinState = {
			channel: 'LinkedIn',
			state: 'CONNECTED_AND_AUTHORIZED',
			note: `Assigned ${assigned?.connectionType ?? 'connection'} ${assigned?.accountName ?? ''}`.trim(),
		};
	} else if (linkedin.length > 0) {
		const others = linkedin.filter((row) => row.brandProfileId !== input.canonicalAirtableId);
		const detail = others.map((row) => {
			const expired = row.expiresAt ? Date.parse(row.expiresAt) <= now : false;
			return `${row.connectionType ?? 'connection'} ${row.accountName ?? 'unnamed'} on ${row.brandProfileId ?? 'unassigned'}${expired ? ' (token expired)' : ''}`;
		}).join('; ');
		linkedinState = {
			channel: 'LinkedIn',
			state: 'CONNECTED_BUT_UNVERIFIED',
			note: detail || 'A LinkedIn connection exists but is not currently authorized for the canonical profile.',
		};
	} else {
		linkedinState = { channel: 'LinkedIn', state: 'SUPPORTED_NOT_CONNECTED', note: 'No LinkedIn connection is stored.' };
	}

	const meta = input.metaPageName
		? {
			channel: 'Meta/Facebook',
			state: input.metaPageBrandScoped ? 'CONNECTED_AND_AUTHORIZED' as const : 'CONNECTED_BUT_UNVERIFIED' as const,
			note: input.metaPageBrandScoped
				? `Selected page ${input.metaPageName} is assigned to this brand.`
				: `Selected page ${input.metaPageName} is on the user account and is not assigned to this BrandProfile.`,
		}
		: { channel: 'Meta/Facebook', state: 'SUPPORTED_NOT_CONNECTED' as const, note: 'No Facebook page is selected.' };

	const instagram = input.instagramUsername
		? {
			channel: 'Instagram',
			state: input.instagramBrandScoped ? 'CONNECTED_AND_AUTHORIZED' as const : 'CONNECTED_BUT_UNVERIFIED' as const,
			note: input.instagramBrandScoped
				? `@${input.instagramUsername} is assigned to this brand.`
				: `@${input.instagramUsername} is selected on the user account and is not assigned to this BrandProfile.`,
		}
		: { channel: 'Instagram', state: 'SUPPORTED_NOT_CONNECTED' as const, note: 'No Instagram account is selected.' };

	return [
		linkedinState,
		meta,
		instagram,
		{
			channel: 'X',
			state: 'NOT_IMPLEMENTED',
			note: input.publicXHandle
				? 'A public X URL is stored on the BrandProfile. Native X publishing is not implemented.'
				: 'Native X publishing is not implemented.',
		},
		{
			channel: 'Blog/website',
			state: 'SUPPORTED_NOT_CONNECTED',
			note: input.publicWebsite
				? `${input.publicWebsite} is the stored website. No CMS connection is stored. Blog output is copy, not a publisher.`
				: 'No website or CMS connection is stored.',
		},
	];
}
