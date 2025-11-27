import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function assignBrandToConnection(connectionId: string, brandProfileId: string) {
	const admin = getSupabaseService();
	
	const { error } = await admin
		.from('social_connections')
		.update({ brand_profile_id: brandProfileId })
		.eq('id', connectionId);

	return { error };
}

export default async function AssignBrandPage({
	searchParams,
}: {
	searchParams: Promise<{ connection_id?: string; type?: string }>;
}) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect('/login');
	}

	const params = await searchParams;
	const connectionId = params?.connection_id;
	const connectionType = params?.type || 'personal';

	if (!connectionId) {
		redirect('/connections?error=missing_connection_id');
	}

	// Fetch connection details
	const admin = getSupabaseService();
	const { data: connection } = await admin
		.from('social_connections')
		.select('id, account_name, account_avatar, organization_urn, organization_name, connection_type, brand_profile_id, metadata')
		.eq('id', connectionId)
		.eq('user_id', user.id)
		.single();
	
	// Determine connection type from connection_type column
	const actualConnectionType = connection?.connection_type === 'organization' ? 'business' : 'personal';

	if (!connection) {
		redirect('/connections?error=connection_not_found');
	}

	// If already assigned, redirect
	if (connection.brand_profile_id) {
		redirect('/connections?connected=linkedin');
	}

	// Fetch user's brand profiles from Airtable
	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

	let brandProfiles: Array<{ id: string; client_name: string; brand_type: string }> = [];

	if (AIRTABLE_TOKEN && BASE_ID && TABLE_ID) {
		try {
			const airtableRes = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula={user_id}="${user.id}"&sort[0][field]=created_time&sort[0][direction]=desc`,
				{
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					},
					cache: 'no-store',
				}
			);

			if (airtableRes.ok) {
				const data = await airtableRes.json();
				brandProfiles = (data.records || []).map((record: any) => ({
					id: record.id,
					client_name: record.fields?.client_name || 'Unnamed Brand',
					brand_type: record.fields?.brand_type || 'company',
				}));
			}
		} catch (error) {
			console.error('Failed to fetch brand profiles:', error);
		}
	}

	// Filter brands based on connection type
	// Personal connections should be assigned to personal brands
	// Business connections should be assigned to company brands
	const filteredBrands = brandProfiles.filter((brand) => {
		if (actualConnectionType === 'personal') {
			return brand.brand_type === 'personal';
		} else {
			return brand.brand_type === 'company';
		}
	});

	// Handle form submission
	const assignAction = async (formData: FormData) => {
		'use server';
		
		const brandProfileId = formData.get('brand_profile_id') as string;
		if (!brandProfileId) {
			redirect('/connections/assign-brand?connection_id=' + connectionId + '&type=' + actualConnectionType + '&error=no_brand_selected');
		}

		const { error } = await assignBrandToConnection(connectionId, brandProfileId);
		
		if (error) {
			redirect('/connections/assign-brand?connection_id=' + connectionId + '&type=' + actualConnectionType + '&error=assignment_failed');
		}

		redirect(`/connections?connected=linkedin${actualConnectionType === 'business' ? '_business' : ''}`);
	};

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div className="mb-2">
				<Link href="/connections" className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1">
					← Back to Connections
				</Link>
			</div>

			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Assign Brand to Connection</h1>
				<p className="text-text-dim">
					Select which brand this LinkedIn {actualConnectionType === 'business' ? 'business account' : 'personal profile'} should be associated with.
				</p>
			</header>

			{/* Connection Info */}
			<div className="card p-6 space-y-4">
				<div className="flex items-center gap-4">
					{connection.account_avatar && (
						<img
							src={connection.account_avatar}
							alt={connection.account_name || 'Account'}
							className="w-16 h-16 rounded-full border border-edge/60"
						/>
					)}
					<div>
						<div className="font-semibold text-lg">
							{connection.account_name || 'LinkedIn Account'}
						</div>
						<div className="text-sm text-text-dim">
							{actualConnectionType === 'business' ? 'Business Account' : 'Personal Profile'}
						</div>
					</div>
				</div>
			</div>

			{/* Brand Selection Form */}
			<form action={assignAction} className="card p-6 space-y-4">
				<div>
					<label htmlFor="brand_profile_id" className="block text-sm font-medium text-text-soft mb-2">
						Select Brand {actualConnectionType === 'personal' ? '(Personal Brands)' : '(Company Brands)'}
					</label>
					{filteredBrands.length === 0 ? (
						<div className="p-4 rounded-xl2 bg-warning/10 border border-warning/30">
							<p className="text-warning text-sm mb-3">
								No {actualConnectionType === 'personal' ? 'personal' : 'company'} brands found.
							</p>
							<p className="text-sm text-text-dim mb-4">
								You need to create a {actualConnectionType === 'personal' ? 'personal' : 'company'} brand profile first.
							</p>
							<Link
								href="/onboarding"
								className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm inline-block"
							>
								Create Brand Profile
							</Link>
						</div>
					) : (
						<select
							id="brand_profile_id"
							name="brand_profile_id"
							required
							className="w-full px-4 py-3 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
						>
							<option value="">Choose a brand...</option>
							{filteredBrands.map((brand) => (
								<option key={brand.id} value={brand.id}>
									{brand.client_name}
								</option>
							))}
						</select>
					)}
				</div>

				{filteredBrands.length > 0 && (
					<div className="flex gap-3">
						<button
							type="submit"
							className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium"
						>
							Assign to Brand
						</button>
						<Link
							href="/connections"
							className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm"
						>
							Cancel
						</Link>
					</div>
				)}
			</form>
		</div>
	);
}

