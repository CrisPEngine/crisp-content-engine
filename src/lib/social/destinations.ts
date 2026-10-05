export type ConnectionHealth = 'CONNECTED' | 'EXPIRING' | 'EXPIRED' | 'ACTION_REQUIRED' | 'DISCONNECTED' | 'ERROR';

export type SocialAuthorization = {
	id: string;
	ownerUserId: string;
	provider: string;
	providerAccountId?: string;
	scopes: string[];
	expiresAt?: string;
	status: ConnectionHealth;
};

export type SocialDestination = {
	id: string;
	authorizationId: string;
	provider: string;
	destinationType: 'profile' | 'organization' | 'page' | 'instagram' | 'channel';
	providerDestinationId: string;
	displayName: string;
	handle?: string;
	status: ConnectionHealth;
};

export type BrandDestination = {
	brandId: string;
	destinationId: string;
	purpose: 'default_publish';
	enabled: boolean;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function connectionHealth(input: { expiresAt?: string | null; reconnectRequired?: boolean; disconnected?: boolean; error?: boolean }, now = Date.now()): ConnectionHealth {
	if (input.disconnected) return 'DISCONNECTED';
	if (input.error) return 'ERROR';
	if (input.reconnectRequired) return 'ACTION_REQUIRED';
	if (!input.expiresAt) return 'CONNECTED';
	const expires = Date.parse(input.expiresAt);
	if (!Number.isFinite(expires)) return 'ERROR';
	if (expires <= now) return 'EXPIRED';
	if (expires - now < WEEK) return 'EXPIRING';
	return 'CONNECTED';
}

export function destinationsForBrand(brandId: string, links: BrandDestination[], destinations: SocialDestination[]): SocialDestination[] {
	const allowed = new Set(links.filter((link) => link.brandId === brandId && link.enabled).map((link) => link.destinationId));
	return destinations.filter((destination) => allowed.has(destination.id));
}
