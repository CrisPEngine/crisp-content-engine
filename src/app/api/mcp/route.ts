import { handleMcpHttp } from '@/lib/agent/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
	return handleMcpHttp(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
