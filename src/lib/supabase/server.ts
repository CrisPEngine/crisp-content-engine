import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function createClient() {
	const cookieStore = await cookies();
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
		{
			cookies: {
				get(name: string) {
					return cookieStore.get(name)?.value;
				},
				set(name: string, value: string, options: CookieOptions) {
					try {
						// Only set cookies if we're in a Server Action or Route Handler
						// In Server Components, we can only read cookies
						cookieStore.set({ name, value, ...options });
					} catch (error) {
						// Silently fail if we can't set cookies (e.g., in Server Component render)
						// This is expected behavior - token refresh will happen on next request
						// The error is: "Cookies can only be modified in a Server Action or Route Handler"
					}
				},
				remove(name: string, options: CookieOptions) {
					try {
						cookieStore.set({ name, value: '', ...options });
					} catch (error) {
						// Silently fail if we can't remove cookies
					}
				}
			}
		}
	);

	return supabase;
}

// Alias for consistency with user code expectations
export const supabaseServer = createClient;


