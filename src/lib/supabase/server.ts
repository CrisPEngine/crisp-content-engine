import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseServerCookieHandlers } from '@/lib/supabase/cookieHandlers';

export async function createClient() {
	const cookieStore = await cookies();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
		{
			cookies: createSupabaseServerCookieHandlers(cookieStore),
		},
	);

	return supabase;
}

// Alias for consistency with user code expectations
export const supabaseServer = createClient;


