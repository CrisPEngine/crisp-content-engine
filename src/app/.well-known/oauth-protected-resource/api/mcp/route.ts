import { NextResponse } from 'next/server';
import { protectedResourceMetadata } from '@/lib/mcp/oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
	return NextResponse.json(protectedResourceMetadata(new URL(request.url).origin));
}
