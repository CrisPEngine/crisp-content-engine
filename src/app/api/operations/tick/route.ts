import { after, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/intelligence/http';
import { runOperationsTick } from '@/lib/operations/tick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
	if (!authorizeCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const result = await runOperationsTick();
	const url = new URL(request.url);
	const depth = Number(url.searchParams.get('continuation') ?? '0');
	if (result.continueWork && Number.isFinite(depth) && depth < 4) {
		url.searchParams.set('continuation', String(depth + 1));
		const authorization = request.headers.get('authorization');
		after(() => fetch(url, { method: 'POST', headers: authorization ? { authorization } : {} }));
	}
	return NextResponse.json(result);
}

export async function POST(request: Request) {
	return GET(request);
}
