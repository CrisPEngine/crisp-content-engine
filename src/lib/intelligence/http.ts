import { createClient } from '@/lib/supabase/server';

export async function requireIntelligenceUser(): Promise<{ userId: string; email?: string }> {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		const err = new Error('Unauthorized');
		(err as Error & { status: number }).status = 401;
		throw err;
	}
	return { userId: user.id, email: user.email };
}

export function authorizeCron(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	const header = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	return header === secret;
}

export async function requireIntelligenceUserOrCron(
	request: Request,
): Promise<{ userId?: string; via: 'session' | 'cron' }> {
	if (authorizeCron(request)) return { via: 'cron' };
	const user = await requireIntelligenceUser();
	return { userId: user.userId, via: 'session' };
}

export function jsonError(error: unknown): { body: { error: string; code?: string }; status: number } {
	const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 400;
	const message = error instanceof Error ? error.message : 'Request failed';
	const code =
		typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : undefined;
	return {
		body: { error: message, ...(code ? { code } : {}) },
		status: Number.isFinite(status) && status >= 400 ? status : 400,
	};
}
