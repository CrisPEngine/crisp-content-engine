import { handleMcpHttp } from '@/lib/agent/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Long-form generation and sync article paths may run multiple LLM calls in one request. */
export const maxDuration = 300;

async function handle(request: Request) {
	return handleMcpHttp(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
