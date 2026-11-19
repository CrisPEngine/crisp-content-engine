import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/intelligence/http';
import { runOperationsTick } from '@/lib/operations/tick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
	if (!authorizeCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const result = await runOperationsTick();
	return NextResponse.json(result);
}

export async function POST(request: Request) {
	return GET(request);
}
