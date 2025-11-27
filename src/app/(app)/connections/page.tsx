import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function LinkedInCard({
	connected,
	accountName,
	accountAvatar,
	personUrn,
	organisationUrn,
	connectionType,
	connectionId,
	needsBrandAssignment,
}: {
	connected: boolean;
	accountName?: string | null;
	accountAvatar?: string | null;
	personUrn?: string | null;
	organisationUrn?: string | null;
	connectionType?: 'personal' | 'business';
	connectionId?: string;
	needsBrandAssignment?: boolean;
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
					<div className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
						Connected
					</div>
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
						<a
							href="https://www.linkedin.com/help/linkedin/answer/a507721"
							target="_blank"
							rel="noopener noreferrer"
							className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm"
						>
							Manage on LinkedIn
						</a>
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

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; details?: string; connected?: string }> }) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect('/login');
	}

	const params = await searchParams;
	const error = params?.error;
	const errorDetails = params?.details;
	const connected = params?.connected;

	const admin = getSupabaseService();
	// Fetch all LinkedIn connections (both personal and business)
	const { data: connections } = await admin
		.from('social_connections')
		.select('id, account_name, account_avatar, person_urn, organisation_urn, connection_type, brand_profile_id, metadata')
		.eq('user_id', user.id)
		.eq('provider', 'linkedin');

	// Separate personal and business connections
	// Check metadata for connection_type and organisation_urn (stored in metadata since columns don't exist)
	// Only show as connected if they have a brand_profile_id assigned
	const personalConnection = connections?.find((c: any) => {
		const metadata = c.metadata || {};
		return metadata.connection_type === 'personal' || (!metadata.organisation_urn && !c.organisation_urn);
	}) || null;
	const businessConnection = connections?.find((c: any) => {
		const metadata = c.metadata || {};
		return metadata.connection_type === 'business' || metadata.organisation_urn || c.organisation_urn;
	}) || null;

	// Determine connection type from metadata or organisation_urn presence
	const getConnectionType = (conn: any): 'personal' | 'business' => {
		if (conn?.organisation_urn) return 'business';
		if (conn?.metadata?.connection_type) return conn.metadata.connection_type;
		return 'personal'; // Default to personal if no organisation_urn
	};

	// Get organisation_urn from metadata if not in column
	const getOrganisationUrn = (conn: any) => {
		return conn?.organisation_urn || conn?.metadata?.organisation_urn || null;
	};

	const personalStatus = {
		connected: Boolean(personalConnection?.brand_profile_id) || (connected === 'linkedin' && Boolean(personalConnection?.brand_profile_id)),
		accountName: personalConnection?.account_name ?? null,
		accountAvatar: personalConnection?.account_avatar ?? null,
		personUrn: personalConnection?.person_urn ?? null,
		connectionType: 'personal' as const,
		connectionId: personalConnection?.id ?? undefined,
		needsBrandAssignment: Boolean(personalConnection && !personalConnection.brand_profile_id),
	};

	const businessStatus = {
		connected: Boolean(businessConnection?.brand_profile_id) || (connected === 'linkedin_business' && Boolean(businessConnection?.brand_profile_id)),
		accountName: businessConnection?.account_name ?? null,
		accountAvatar: businessConnection?.account_avatar ?? null,
		organisationUrn: getOrganisationUrn(businessConnection),
		personUrn: businessConnection?.person_urn ?? null,
		connectionType: 'business' as const,
		connectionId: businessConnection?.id ?? undefined,
		needsBrandAssignment: Boolean(businessConnection && !businessConnection.brand_profile_id),
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

			<LinkedInCard {...personalStatus} />
			<LinkedInCard {...businessStatus} />

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

