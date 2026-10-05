export default async function DataDeletionStatusPage({
	searchParams,
}: {
	searchParams: Promise<{ code?: string; provider?: string }>;
}) {
	const params = await searchParams;
	const code = params.code;
	const provider = params.provider || 'meta';

	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
			<div className="max-w-md text-center space-y-4">
				<h1 className="text-xl font-semibold">Data deletion request received</h1>
				<p className="text-sm text-neutral-400">
					We have processed your {provider === 'instagram' ? 'Instagram Login' : 'Meta'} data removal request.
					Associated OAuth tokens and native connection records tied to this authorization have been revoked or deleted.
				</p>
				{code && (
					<p className="text-xs font-mono text-neutral-500 break-all">Confirmation: {code}</p>
				)}
				<p className="text-xs text-neutral-500">
					Legacy publishing queues may retain historical job metadata separately. Contact support if you need a full account erasure.
				</p>
			</div>
		</main>
	);
}
