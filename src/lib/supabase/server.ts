import { cookies, headers } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export function createClient() {
	const cookieStore = cookies();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
		{
			cookies: {
				get(name: string) {
					return cookieStore.get(name)?.value;
				},
				set(name: string, value: string, options: CookieOptions) {
					cookieStore.set({ name, value, ...options });
				},
				remove(name: string, options: CookieOptions) {
					cookieStore.set({ name, value: '', ...options });
				}
			},
			headers: {
				'x-forwarded-host': headers().get('x-forwarded-host') ?? undefined,
				'x-forwarded-proto': headers().get('x-forwarded-proto') ?? undefined,
			}
		}
	);

	return supabase;
}

// Alias for consistency with user code expectations
export const supabaseServer = createClient;


