import { createClient } from '@supabase/supabase-js';

export function getSupabasePublic() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env vars');
	return createClient(url, anon, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { 'X-Client-Info': 'cce/1.0' } },
	});
}

