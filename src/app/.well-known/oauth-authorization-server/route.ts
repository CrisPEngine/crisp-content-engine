import { NextResponse } from 'next/server';
import { authorizationServerMetadata } from '@/lib/mcp/oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
	return NextResponse.json(authorizationServerMetadata(new URL(request.url).origin));
}
