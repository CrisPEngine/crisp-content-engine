import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { AuthLoadingHandler } from '@/components/AuthLoadingHandler';
import Link from 'next/link';
import { isMetaPublishingEnabledClient } from '@/lib/featureFlags';
import { connectionHealth, type ConnectionHealth } from '@/lib/social/destinations';
import { BrandDestinationsPanel, AuthorizationAccountsPanel } from '@/components/BrandDestinationsPanel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function ConnectionBadge({ health }: { health: ConnectionHealth }) {
	const label = health === 'ACTION_REQUIRED' ? 'Action required' : health.charAt(0) + health.slice(1).toLowerCase();
	const ready = health === 'CONNECTED';
	return (
		<div className={ready
			? 'text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
			: 'text-xs px-2 py-1 rounded-full bg-warning/15 border border-warning/40 text-warning'}
		>
			{label}
		</div>
	);
}

function LinkedInCard({
	connected,
	accountName,
	accountAvatar,
	personUrn,
	organisationUrn,
	connectionType,
	connectionId,
	needsBrandAssignment,
	health,
}: {
	connected: boolean;
	accountName?: string | null;
	accountAvatar?: string | null;
	personUrn?: string | null;
	organisationUrn?: string | null;
	connectionType?: 'personal' | 'business';
	connectionId?: string;
	needsBrandAssignment?: boolean;
	health?: ConnectionHealth;
}) {
	const connectHref = connectionType === 'business' 
		? '/api/connections/linkedin/authorize?type=business'
		: '/api/connections/linkedin/authorize?type=personal';
	
	const isBusiness = connectionType === 'business';
	const title = isBusiness ? 'LinkedIn Business Account' : 'LinkedIn Personal Profile';
	const description = isBusiness 
		? 'Share directly to your LinkedIn company page.'
		: 'Share directly to your LinkedIn personal profile.';

	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span className="text-4xl">{isBusiness ? '🏢' : '👤'}</span>
					<div>
						<h2 className="text-xl font-semibold">{title}</h2>
						<p className="text-sm text-text-dim">{description}</p>
					</div>
				</div>
				{connected && !needsBrandAssignment && (
					<ConnectionBadge health={health ?? 'CONNECTED'} />
				)}
				{needsBrandAssignment && (
					<div className="text-xs px-2 py-1 rounded-full bg-warning/15 border border-warning/40 text-warning">
						Needs Brand Assignment
					</div>
				)}
			</div>

			{connected || needsBrandAssignment ? (
				<div className="space-y-3">
					<div className="flex items-start gap-4">
						{accountAvatar && (
							<img src={accountAvatar} alt={isBusiness ? 'Company logo' : 'LinkedIn avatar'} className="w-12 h-12 rounded-full border border-edge/60" />
						)}
						<div className="text-sm space-y-1 flex-1">
							<div className="font-medium">{accountName || (isBusiness ? 'Company Page' : 'LinkedIn Profile')}</div>
							{isBusiness && organisationUrn && (
								<div className="text-text-dim text-xs">{organisationUrn}</div>
							)}
							{!isBusiness && personUrn && (
								<div className="text-text-dim text-xs">{personUrn}</div>
							)}
						</div>
					</div>
					{(health === 'EXPIRED' || health === 'EXPIRING' || health === 'ACTION_REQUIRED') && (
						<div className="p-3 rounded-xl2 bg-warning/10 border border-warning/30">
							<p className="text-warning text-sm font-medium mb-1">{health === 'EXPIRED' ? 'Expired' : 'Reconnection required'}</p>
							<p className="text-warning/90 text-sm mb-2">
								This LinkedIn token cannot be treated as ready to publish. Reconnect it before scheduling.
							</p>
						</div>
					)}
					{needsBrandAssignment && (
						<div className="p-3 rounded-xl2 bg-warning/10 border border-warning/30">
							<p className="text-warning text-sm mb-2">This connection needs to be assigned to a brand.</p>
							<Link
								href={`/connections/assign-brand?connection_id=${connectionId}&type=${connectionType}`}
								className="px-3 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning font-medium text-sm inline-block"
							>
								Assign to Brand
							</Link>
						</div>
					)}
				</div>
			) : (
				<p className="text-sm text-text-dim">
					{isBusiness 
						? 'Connect your LinkedIn business account to publish content to your company page and access analytics.'
						: 'Connect your LinkedIn personal profile to publish strategies, updates, and content without leaving CrisP Content Engine.'}
				</p>
			)}

			<div className="flex gap-3">
				{connected && !needsBrandAssignment ? (
					<>
						<form action="/api/connections/linkedin/disconnect" method="post">
							<input type="hidden" name="connection_id" value={connectionId || ''} />
							<input type="hidden" name="connection_type" value={connectionType || 'personal'} />
							<button
								type="submit"
								className="px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 text-sm"
							>
								Disconnect
							</button>
						</form>
					</>
				) : !needsBrandAssignment ? (
					<a
						href={connectHref}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
					>
						Connect {isBusiness ? 'Business Account' : 'Personal Profile'}
					</a>
				) : null}
			</div>
		</div>
	);
}

function MetaCard({
	connected,
	selectedPage,
	selectedInstagram,
	tokenExpiresAt,
	health,
}: {
	connected: boolean;
	selectedPage?: { pageId: string; pageName: string } | null;
	selectedInstagram?: { igUserId: string; igUsername: string } | null;
	tokenExpiresAt?: string | null;
	health?: ConnectionHealth;
}) {
	const connectHref = '/api/meta/oauth/start';
	const healthStatus = health ?? connectionHealth({ expiresAt: tokenExpiresAt });

	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span className="text-4xl">📱</span>
					<div>
						<h2 className="text-xl font-semibold">Meta (Facebook & Instagram)</h2>
						<p className="text-sm text-text-dim">Publish to Facebook Pages and Instagram Business accounts.</p>
					</div>
				</div>
				{connected && <ConnectionBadge health={healthStatus} />}
			</div>

			{connected ? (
				<div className="space-y-3">
					<div className="text-sm space-y-3">
						{selectedPage && (
							<div className="flex items-start gap-2">
								<span className="text-blue-400">📘</span>
								<div>
									<div className="font-medium">Facebook Page</div>
									<div className="text-text-dim text-xs">{selectedPage.pageName}</div>
								</div>
							</div>
						)}
						{selectedInstagram && (
							<div className="flex items-start gap-2">
								<span className="text-pink-400">📷</span>
								<div>
									<div className="font-medium">Instagram Business</div>
									<div className="text-text-dim text-xs">@{selectedInstagram.igUsername}</div>
								</div>
							</div>
						)}
						{!selectedPage && !selectedInstagram && (
							<div className="text-text-dim text-xs italic">No destinations selected yet.</div>
						)}
					</div>
					{healthStatus !== 'CONNECTED' && (
						<div className="p-3 rounded-xl2 bg-warning/10 border border-warning/30">
							<p className="text-warning text-sm font-medium mb-1">{healthStatus === 'EXPIRED' ? 'Expired' : 'Reconnection required'}</p>
							<p className="text-warning/90 text-sm">This Meta authorization cannot be treated as ready to publish until it is reconnected.</p>
						</div>
					)}
					<div className="p-3 rounded-xl2 bg-blue-500/10 border border-blue-500/20 text-sm text-text-dim">
						One CCE account can authorize Meta once and publish each brand to its own Page or Instagram account.
						Changing one brand does not disconnect another. A token that cannot publish is not shown as connected.
						<a href="/connections/meta/select" className="text-primary hover:underline">Change Page &amp; Instagram</a>
					</div>
				</div>
			) : (
				<p className="text-sm text-text-dim">
					Connect your Meta account to publish content to your Facebook Page and Instagram Business account directly from CRISP.
				</p>
			)}

			<div className="flex flex-wrap gap-3">
				{connected ? (
					<>
						<a
							href={connectHref}
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
						>
							Add Meta account
						</a>
						<form action="/api/meta/disconnect" method="post">
							<button
								type="submit"
								className="px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 text-sm"
							>
								Disconnect primary
							</button>
						</form>
					</>
				) : (
					<a
						href={connectHref}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
					>
						Connect Instagram/Facebook
					</a>
				)}
			</div>
		</div>
	);
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; details?: string; connected?: string; reauth?: string; auth?: string }> }) {
	const supabase = await createClient();
	const params = await searchParams;
	const isAuthLoading = params?.auth === 'loading';
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		// Keep interstitial until session is ready – do not drop to sign-in during OAuth
		if (isAuthLoading) {
			return (
				<>
					<AuthLoadingHandler redirectTo="/connections?reauth=true" />
					<div className="flex items-center justify-center min-h-[60vh]">
						<div className="text-center space-y-4">
							<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
							<p className="text-text-soft text-sm">Completing sign in...</p>
						</div>
					</div>
				</>
			);
		}
		redirect('/sign-in');
	}

	const error = params?.error;
	const errorDetails = params?.details;
	const connected = params?.connected;

	const admin = getSupabaseService();
	// Fetch LinkedIn connections separately by connection_type
	// Member connection (personal profile)
	const { data: memberConnection } = await admin
		.from('social_connections')
		.select('id, account_name, account_avatar, person_urn, organization_urn, organization_name, connection_type, brand_profile_id, metadata, expires_at, needs_reauth')
		.eq('user_id', user.id)
		.eq('provider', 'linkedin')
		.eq('connection_type', 'member')
		.maybeSingle();

	// Organization connection (business account)
	const { data: organizationConnection } = await admin
		.from('social_connections')
		.select('id, account_name, account_avatar, person_urn, organization_urn, organization_name, connection_type, brand_profile_id, metadata, expires_at, needs_reauth')
		.eq('user_id', user.id)
		.eq('provider', 'linkedin')
		.eq('connection_type', 'organization')
		.maybeSingle();

	const linkedInHealth = (connection: typeof memberConnection): ConnectionHealth => connectionHealth({
		expiresAt: connection?.expires_at,
		reconnectRequired: Boolean(connection?.needs_reauth),
		disconnected: !connection,
	});

	const personalConnection = memberConnection || null;
	const businessConnection = organizationConnection || null;

	// Fetch Meta connection status (if feature flag enabled)
	const metaStatus: {
		connected: boolean;
		selectedPage?: { pageId: string; pageName: string } | null;
		selectedInstagram?: { igUserId: string; igUsername: string } | null;
		tokenExpiresAt?: string | null;
	} = { connected: false };

	if (isMetaPublishingEnabledClient()) {
		const { data: metaConnection } = await admin
			.from('meta_connections')
			.select('facebook_user_id, token_expires_at')
			.eq('user_id', user.id)
			.maybeSingle();

		if (metaConnection) {
			metaStatus.connected = true;
			metaStatus.tokenExpiresAt = metaConnection.token_expires_at;

			// Fetch selected page
			const { data: selectedPage } = await admin
				.from('meta_pages')
				.select('page_id, page_name')
				.eq('user_id', user.id)
				.eq('is_selected', true)
				.maybeSingle();

			if (selectedPage) {
				metaStatus.selectedPage = {
					pageId: selectedPage.page_id,
					pageName: selectedPage.page_name,
				};
			}

			// Fetch selected Instagram account
			const { data: selectedIg } = await admin
				.from('meta_instagram_accounts')
				.select('ig_user_id, ig_username')
				.eq('user_id', user.id)
				.eq('is_selected', true)
				.maybeSingle();

			if (selectedIg) {
				metaStatus.selectedInstagram = {
					igUserId: selectedIg.ig_user_id,
					igUsername: selectedIg.ig_username,
				};
			}
		}
	}

	const personalStatus = {
		connected: Boolean(personalConnection?.brand_profile_id) || (connected === 'linkedin' && Boolean(personalConnection?.brand_profile_id)),
		accountName: personalConnection?.account_name ?? null,
		accountAvatar: personalConnection?.account_avatar ?? null,
		personUrn: personalConnection?.person_urn ?? null,
		connectionType: 'personal' as const,
		connectionId: personalConnection?.id ?? undefined,
		needsBrandAssignment: Boolean(personalConnection && !personalConnection.brand_profile_id),
		health: linkedInHealth(personalConnection),
	};

	const businessStatus = {
		connected: Boolean(businessConnection?.brand_profile_id) || (connected === 'linkedin_business' && Boolean(businessConnection?.brand_profile_id)),
		accountName: businessConnection?.organization_name ?? businessConnection?.account_name ?? null,
		accountAvatar: businessConnection?.account_avatar ?? null,
		organisationUrn: businessConnection?.organization_urn ?? null,
		personUrn: businessConnection?.person_urn ?? null,
		connectionType: 'business' as const,
		connectionId: businessConnection?.id ?? undefined,
		needsBrandAssignment: Boolean(businessConnection && !businessConnection.brand_profile_id),
		health: linkedInHealth(businessConnection),
	};

	return (
		<div className="mx-auto max-w-4xl space-y-6">
			<div className="mb-2">
				<a href="/dashboard" className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1">
					← Back
				</a>
			</div>
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Connections</h1>
				<p className="text-text-dim">
					Connect your social accounts so the AI can publish content automatically on your behalf.
				</p>
			</header>

			{error && (
				<div className="card p-4 border-danger/40 bg-danger/10">
					<div className="font-medium text-danger mb-1">Connection Error</div>
					<div className="text-sm text-text-dim">
						{error === 'linkedin_auth_failed' && 'Failed to connect LinkedIn account. Please try again.'}
						{error === 'invalid_response' && 'Invalid response from LinkedIn. Please try again.'}
						{error === 'state_mismatch' && 'Security validation failed. Please try again.'}
						{errorDetails && <div className="mt-2 text-xs font-mono">{decodeURIComponent(errorDetails)}</div>}
					</div>
				</div>
			)}

			{params?.reauth === 'true' && (
				<div className="card p-4 border-primary/40 bg-primary/10">
					<div className="font-medium text-primary mb-1">Reconnect Your LinkedIn Account</div>
					<div className="text-sm text-text-dim space-y-2">
						<p>Your LinkedIn connection has expired. To resume publishing:</p>
						<ol className="list-decimal ml-5 space-y-1">
							<li>Click Disconnect below</li>
							<li>Then click Connect to reconnect your account</li>
						</ol>
						<p className="mt-2">This takes less than a minute and your pending posts will automatically publish once reconnected.</p>
					</div>
				</div>
			)}

			{(connected === 'linkedin' || connected === 'linkedin_business') && !error && (
				<div className="card p-4 border-emerald-500/40 bg-emerald-500/10">
					<div className="font-medium text-emerald-300 mb-1">Successfully Connected!</div>
					<div className="text-sm text-text-dim">
						Your LinkedIn {connected === 'linkedin_business' ? 'business account' : 'personal profile'} has been connected.
					</div>
				</div>
			)}

			{error === 'no_organizations' && (
				<div className="card p-4 border-warning/40 bg-warning/10">
					<div className="font-medium text-warning mb-1">No Company Pages Found</div>
					<div className="text-sm text-text-dim">
						{errorDetails ? decodeURIComponent(errorDetails) : 'You must be an administrator of at least one LinkedIn company page to connect a business account.'}
					</div>
				</div>
			)}

			<BrandDestinationsPanel />
			<AuthorizationAccountsPanel />

			<LinkedInCard {...personalStatus} />
			<LinkedInCard {...businessStatus} />

			{isMetaPublishingEnabledClient() && <MetaCard {...metaStatus} />}

			<div className="card p-6 bg-primary/5 border-primary/20">
				<h2 className="font-semibold mb-2">How it works</h2>
				<ol className="list-decimal ml-5 text-sm space-y-1 text-text-dim">
					<li>Connect your LinkedIn account.</li>
					<li>Approve your content strategy and schedule posts.</li>
					<li>Our automation publishes directly to LinkedIn with tracking.</li>
				</ol>
			</div>
		</div>
	);
}

