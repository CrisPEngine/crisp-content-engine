import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
	const res = NextResponse.next({
		request: { headers: req.headers },
	});

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				get(name: string) {
					return req.cookies.get(name)?.value;
				},
				set(name: string, value: string, options: CookieOptions) {
					res.cookies.set({ name, value, ...options });
				},
				remove(name: string, options: CookieOptions) {
					res.cookies.set({ name, value: '', ...options, expires: new Date(0) });
				},
			},
			headers: {
				'x-forwarded-host': req.headers.get('x-forwarded-host') ?? undefined,
				'x-forwarded-proto': req.headers.get('x-forwarded-proto') ?? undefined,
			},
		}
	);

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const protectedPaths = ['/dashboard', '/onboarding', '/billing', '/app'];
	const pathname = req.nextUrl.pathname;
	const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

	if (isProtected && !user) {
		const url = req.nextUrl.clone();
		url.pathname = '/login';
		url.searchParams.set('redirect', pathname);
		return NextResponse.redirect(url);
	}

	return res;
}

export const config = {
	matcher: ['/dashboard/:path*', '/onboarding/:path*', '/billing/:path*', '/app/:path*'],
};


