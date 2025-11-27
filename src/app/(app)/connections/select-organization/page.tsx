import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { decryptToken } from '@/lib/encryption';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function saveOrganizationConnection(
	userId: string,
	organization: { urn: string; name: string; logoUrl: string | null },
	accessToken: string,
	refreshToken: string | null,
	expiresAt: string | null,
	personUrn: string,
	profile: any
) {
	const admin = getSupabaseService();
	const { encryptToken } = await import('@/lib/encryption');

	const connectionData: any = {
		user_id: userId,
		provider: 'linkedin',
		connection_type: 'organization',
		access_token: encryptToken(accessToken),
		refresh_token: refreshToken ? encryptToken(refreshToken) : null,
		expires_at: expiresAt ?? null,
		person_urn: personUrn,
		organization_urn: organization.urn,
		organization_name: organization.name,
		account_name: organization.name,
		account_avatar: organization.logoUrl,
		metadata: {
			...profile,
		},
		updated_at: new Date().toISOString(),
	};

	// Check if connection already exists
	let existingConnection: { id: string } | null = null;
	try {
		const { data } = await admin
			.from('social_connections')
			.select('id')
			.eq('user_id', userId)
			.eq('provider', 'linkedin')
			.eq('connection_type', 'organization')
			.eq('organization_urn', organization.urn)
			.maybeSingle();
		existingConnection = data;
	} catch (queryError: any) {
		if (queryError?.message?.includes('connection_type') || queryError?.message?.includes('column')) {
			throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details.`);
		}
		throw queryError;
	}

	let connectionId: string;
	if (existingConnection) {
		// Update existing connection
		const { error: updateError } = await admin
			.from('social_connections')
			.update(connectionData)
			.eq('id', existingConnection.id);

		if (updateError) {
			if (updateError.message.includes('connection_type') || updateError.message.includes('organization_urn')) {
				throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details.`);
			}
			throw new Error(`Failed to update connection: ${updateError.message}`);
		}
		connectionId = existingConnection.id;
	} else {
		// Insert new connection
		const { data: newConnection, error: insertError } = await admin
			.from('social_connections')
			.insert(connectionData)
			.select('id')
			.single();

		if (insertError || !newConnection) {
			if (insertError?.message?.includes('connection_type') || insertError?.message?.includes('organization_urn') || insertError?.message?.includes('constraint')) {
				throw new Error(`Database migration required: Please run the SQL migration in database_migrations/add_linkedin_connection_types.sql first. See DATABASE_MIGRATION_INSTRUCTIONS.md for details. Original error: ${insertError.message}`);
			}
			throw new Error(`Failed to save connection: ${insertError?.message || 'Unknown error'}`);
		}
		connectionId = newConnection.id;
	}

	return connectionId;
}

export default async function SelectOrganizationPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; org_urn?: string; details?: string }>;
}) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect('/login');
	}

	const params = await searchParams;
	const cookieStore = await import('next/headers').then(m => m.cookies());
	const orgSelectionCookie = cookieStore.get('linkedin_org_selection')?.value;

	// If cookie doesn't exist, check if user already has an organization connection without brand assignment
	// This handles cases where the cookie expired but connection was saved
	if (!orgSelectionCookie) {
		const admin = getSupabaseService();
		const { data: existingConnections } = await admin
			.from('social_connections')
			.select('id, organization_urn, brand_profile_id')
			.eq('user_id', user.id)
			.eq('provider', 'linkedin')
			.eq('connection_type', 'organization');

		// Check if there's a connection without brand assignment
		const unassignedConnection = existingConnections?.find(conn => !conn.brand_profile_id);
		
		if (unassignedConnection) {
			// Redirect to brand assignment for this existing connection
			redirect(`/connections/assign-brand?connection_id=${unassignedConnection.id}&type=business`);
		}

		// If no unassigned connection exists, show expired error
		redirect('/connections?error=expired_selection&details=Organization selection expired. Please try connecting again.');
	}

	let orgData: {
		organizations: Array<{ urn: string; name: string; logoUrl: string | null }>;
		accessToken: string;
		refreshToken: string | null;
		expiresAt: string | null;
		personUrn: string;
		profile: any;
	};

	try {
		orgData = JSON.parse(orgSelectionCookie);
		// Decrypt tokens
		const decryptedAccessToken = decryptToken(orgData.accessToken);
		if (!decryptedAccessToken) {
			throw new Error('Failed to decrypt access token');
		}
		orgData.accessToken = decryptedAccessToken;
		
		if (orgData.refreshToken) {
			const decryptedRefreshToken = decryptToken(orgData.refreshToken);
			orgData.refreshToken = decryptedRefreshToken;
		}
	} catch (error) {
		console.error('Failed to parse organization selection data:', error);
		redirect('/connections?error=invalid_selection&details=Invalid organization selection data. Please try connecting again.');
	}

	// Handle organization selection
	const selectAction = async (formData: FormData) => {
		'use server';

		const selectedOrgUrn = formData.get('organization_urn') as string;
		if (!selectedOrgUrn) {
			redirect('/connections/select-organization?error=no_organization_selected');
		}

		const selectedOrg = orgData.organizations.find(org => org.urn === selectedOrgUrn);
		if (!selectedOrg) {
			redirect('/connections/select-organization?error=invalid_organization');
		}

		try {
			const connectionId = await saveOrganizationConnection(
				user.id,
				selectedOrg,
				orgData.accessToken,
				orgData.refreshToken,
				orgData.expiresAt,
				orgData.personUrn,
				orgData.profile
			);

			// Don't clear cookie yet - keep it until brand assignment is complete
			// This allows recovery if user navigates back
			// Cookie will expire naturally after 5 minutes

			// Redirect to brand assignment
			redirect(`/connections/assign-brand?connection_id=${connectionId}&type=business`);
		} catch (error: any) {
			// Re-throw redirect errors - Next.js redirect() throws a special error
			if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
				throw error;
			}
			console.error('Failed to save organization connection:', error);
			redirect(`/connections/select-organization?error=save_failed&details=${encodeURIComponent(error.message || 'Failed to save connection')}`);
		}
	};

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div className="mb-2">
				<Link href="/connections" className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1">
					← Back to Connections
				</Link>
			</div>

			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Select Business Account</h1>
				<p className="text-text-dim">
					You manage multiple LinkedIn business accounts. Select which one you'd like to connect.
				</p>
			</header>

			{params?.error && (
				<div className="card p-4 bg-danger/10 border border-danger/30">
					<p className="text-danger text-sm">
						{params.error === 'save_failed' && params.details
							? decodeURIComponent(params.details)
							: 'An error occurred. Please try again.'}
					</p>
				</div>
			)}

			<form action={selectAction} className="space-y-4">
				{orgData.organizations.map((org) => (
					<label
						key={org.urn}
						className="card p-6 flex items-center gap-4 cursor-pointer hover:border-primary/60 transition-colors"
					>
						<input
							type="radio"
							name="organization_urn"
							value={org.urn}
							required
							className="w-5 h-5 text-primary focus:ring-primary/20"
						/>
						{org.logoUrl && (
							<img
								src={org.logoUrl}
								alt={org.name}
								className="w-16 h-16 rounded-full border border-edge/60 object-cover"
							/>
						)}
						{!org.logoUrl && (
							<div className="w-16 h-16 rounded-full border border-edge/60 bg-surface/40 flex items-center justify-center">
								<span className="text-2xl text-text-dim">
									{org.name.charAt(0).toUpperCase()}
								</span>
							</div>
						)}
						<div className="flex-1">
							<div className="font-semibold text-lg">{org.name}</div>
							<div className="text-sm text-text-dim">LinkedIn Business Account</div>
						</div>
					</label>
				))}

				<div className="flex gap-3">
					<button
						type="submit"
						className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium"
					>
						Continue
					</button>
					<Link
						href="/connections"
						className="px-6 py-3 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm"
					>
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}

