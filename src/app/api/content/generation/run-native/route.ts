import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCron } from '@/lib/intelligence/http';
import { runNativeContentBatch } from '@/lib/intelligence/content/nativeBatchGeneration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
	generation_job_id: z.string().min(1),
});

export async function POST(request: Request) {
	if (!authorizeCron(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const body = schema.parse(await request.json());
		await runNativeContentBatch(body.generation_job_id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Native generation failed';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
