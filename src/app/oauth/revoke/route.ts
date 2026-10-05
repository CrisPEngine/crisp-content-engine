import { NextResponse } from 'next/server';
import { revokeRefresh, supabaseOauthStore } from '@/lib/mcp/grants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	const form = await request.formData();
	await revokeRefresh(supabaseOauthStore, String(form.get('token') ?? ''));
	return new NextResponse(null, { status: 200 });
}
