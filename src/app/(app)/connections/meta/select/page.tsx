import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MetaSelectForm } from './MetaSelectForm';
import { isMetaPublishingEnabledClient } from '@/lib/featureFlags';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MetaSelectPage() {
	if (!isMetaPublishingEnabledClient()) {
		redirect('/connections');
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect('/sign-in');
	}

	// Check that Meta is connected
	const { data: connection } = await supabase
		.from('meta_connections')
		.select('id')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!connection) {
		redirect('/connections');
	}

	const { data: pages } = await supabase
		.from('meta_pages')
		.select('id, page_id, page_name, is_selected')
		.eq('user_id', user.id)
		.order('page_name');

	const { data: instagramAccounts } = await supabase
		.from('meta_instagram_accounts')
		.select('id, ig_user_id, ig_username, connected_page_id, is_selected')
		.eq('user_id', user.id)
		.order('ig_username');

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div className="mb-2">
				<Link href="/connections" className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1">
					← Back to Connections
				</Link>
			</div>
			<MetaSelectForm
				pages={pages || []}
				instagramAccounts={instagramAccounts || []}
			/>
		</div>
	);
}
