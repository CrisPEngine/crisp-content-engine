import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function LinkedInCard({
	connected,
	accountName,
	accountAvatar,
	personUrn,
}: {
	connected: boolean;
	accountName?: string | null;
	accountAvatar?: string | null;
	personUrn?: string | null;
}) {
	const connectHref = '/api/connections/linkedin/authorize';
	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span className="text-4xl">💼</span>
					<div>
						<h2 className="text-xl font-semibold">LinkedIn</h2>
						<p className="text-sm text-text-dim">Share directly to your LinkedIn profile or company page.</p>
					</div>
				</div>
				{connected && (
					<div className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
						Connected
					</div>
				)}
			</div>

			{connected ? (
				<div className="flex items-start gap-4">
					{accountAvatar && (
						<img src={accountAvatar} alt="LinkedIn avatar" className="w-12 h-12 rounded-full border border-edge/60" />
					)}
					<div className="text-sm space-y-1">
						<div className="font-medium">{accountName}</div>
						{personUrn && <div className="text-text-dim">{personUrn}</div>}
					</div>
				</div>
			) : (
				<p className="text-sm text-text-dim">
					Connect your LinkedIn account to publish strategies, updates, and content without leaving CrisP Content Engine.
				</p>
			)}

			<div className="flex gap-3">
				{connected ? (
					<form action="/api/connections/linkedin/disconnect" method="post">
						<button
							type="submit"
							className="px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 text-sm"
						>
							Disconnect LinkedIn
						</button>
					</form>
				) : (
					<a
						href={connectHref}
						className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
					>
						Connect LinkedIn
					</a>
				)}
				{connected && (
					<a
						href="https://www.linkedin.com/help/linkedin/answer/a507721"
						target="_blank"
						rel="noopener noreferrer"
						className="px-4 py-2 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm"
					>
						Manage on LinkedIn
					</a>
				)}
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
	const { data } = await admin
		.from('social_connections')
		.select('account_name, account_avatar, person_urn, provider')
		.eq('user_id', user.id)
		.eq('provider', 'linkedin')
		.maybeSingle();

	const linkedInStatus = {
		connected: Boolean(data) || connected === 'linkedin',
		accountName: data?.account_name ?? null,
		accountAvatar: data?.account_avatar ?? null,
		personUrn: data?.person_urn ?? null,
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

			{connected === 'linkedin' && !error && (
				<div className="card p-4 border-emerald-500/40 bg-emerald-500/10">
					<div className="font-medium text-emerald-300 mb-1">Successfully Connected!</div>
					<div className="text-sm text-text-dim">Your LinkedIn account has been connected.</div>
				</div>
			)}

			<LinkedInCard {...linkedInStatus} />

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

