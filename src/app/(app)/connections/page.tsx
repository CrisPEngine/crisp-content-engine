import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthLoadingHandler } from '@/components/AuthLoadingHandler';
import { ConnectionsExperience } from '@/components/ConnectionsExperience';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ConnectionsPage({
	searchParams,
}: {
	searchParams: Promise<{
		error?: string;
		details?: string;
		connected?: string;
		reauth?: string;
		auth?: string;
		brand?: string;
		account?: string;
		destination_id?: string;
		assigned?: string;
	}>;
}) {
	const supabase = await createClient();
	const params = await searchParams;
	const isAuthLoading = params?.auth === 'loading';
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
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

	const oauthSuccess =
		params.connected === 'instagram' && params.account
			? {
					channel: 'instagram',
					account: params.account,
					destinationId: params.destination_id,
					assigned: params.assigned === '1',
				}
			: undefined;

	return (
		<div className="mx-auto max-w-4xl space-y-6 px-4 pb-10">
			<div className="mb-2 pt-4">
				<a href="/dashboard" className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1">
					← Back
				</a>
			</div>
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Connections</h1>
				<p className="text-text-dim">
					Connect the channels you want CCE to use for approved and scheduled content.
				</p>
			</header>

			{params?.reauth === 'true' && (
				<div className="card p-4 border-primary/40 bg-primary/10 text-sm text-text-dim">
					<p className="font-medium text-primary mb-1">Reconnect required</p>
					<p>Open the channel below and use reconnect or connect again from Manage connected accounts.</p>
				</div>
			)}

			<ConnectionsExperience
				initialBrandId={params.brand}
				oauthSuccess={oauthSuccess}
				error={params.error ?? null}
				errorDetails={params.details ?? null}
			/>
		</div>
	);
}
