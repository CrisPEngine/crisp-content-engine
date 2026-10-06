import type { CookieOptions } from '@supabase/ssr';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

/**
 * Supabase SSR cookie adapter for Next.js Server Components, Server Actions, and Route Handlers.
 * In Server Components, cookie writes throw — we no-op so auth reads still work; refresh runs in middleware/actions.
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export function createSupabaseServerCookieHandlers(cookieStore: ReadonlyRequestCookies) {
	return {
		get(name: string) {
			return cookieStore.get(name)?.value;
		},
		set(name: string, value: string, options: CookieOptions) {
			try {
				cookieStore.set({ name, value, ...options });
			} catch {
				// Expected in Server Component render when Supabase refreshes the session.
			}
		},
		remove(name: string, options: CookieOptions) {
			try {
				cookieStore.set({ name, value: '', ...options });
			} catch {
				// Expected in Server Component render.
			}
		},
	};
}
