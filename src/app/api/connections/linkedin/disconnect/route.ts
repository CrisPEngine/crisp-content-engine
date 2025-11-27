import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const formData = await request.formData();
	const connectionId = formData.get('connection_id') as string | null;
	const connectionType = formData.get('connection_type') as string | null;

	const admin = getSupabaseService();
	
	// If connection_id is provided, delete that specific connection
	// Otherwise, delete all LinkedIn connections (backward compatibility)
	if (connectionId) {
		// Verify the connection belongs to the user before deleting
		const { data: connection } = await admin
			.from('social_connections')
			.select('id, user_id')
			.eq('id', connectionId)
			.eq('user_id', user.id)
			.single();

		if (connection) {
			await admin
				.from('social_connections')
				.delete()
				.eq('id', connectionId)
				.eq('user_id', user.id);
		}
	} else {
		// Fallback: delete all LinkedIn connections for this user
		await admin
			.from('social_connections')
			.delete()
			.eq('user_id', user.id)
			.eq('provider', 'linkedin');
	}

	// Redirect back to connections page
	const url = new URL(request.url);
	const origin = url.origin;
	return NextResponse.redirect(new URL('/connections?disconnected=linkedin', origin));
}
