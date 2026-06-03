import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isOperatorConsoleEnabled } from '@/lib/featureFlags';
import { OperatorAdminConsole } from './OperatorAdminConsole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdminPageAccess() {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) {
		redirect('/sign-in');
	}

	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	if (!profile?.is_admin) {
		redirect('/dashboard');
	}
}

export default async function OperatorAdminPage() {
	if (!isOperatorConsoleEnabled()) {
		notFound();
	}

	await requireAdminPageAccess();
	return <OperatorAdminConsole />;
}
