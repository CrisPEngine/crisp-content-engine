import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
	previewSessionId: z.string().min(1),
});

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const previewSessionId = url.searchParams.get('previewSessionId');

		if (!previewSessionId) {
			return NextResponse.json({ error: 'previewSessionId is required' }, { status: 400 });
		}

		const admin = getSupabaseService();
		const { data: session, error: sessionError } = await admin
			.from('preview_sessions')
			.select('*')
			.eq('preview_session_id', previewSessionId)
			.maybeSingle();

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
		}

		const response: any = {
			previewSessionId: session.preview_session_id,
			status: session.status,
		};

		// Include outputs only if status is 'generated'
		if (session.status === 'generated' && session.outputs_json) {
			try {
				response.outputs = typeof session.outputs_json === 'string'
					? JSON.parse(session.outputs_json)
					: session.outputs_json;
			} catch (parseError) {
				console.error('[Preview Status] JSON parse error:', { previewSessionId, error: parseError });
				response.status = 'failed';
				response.error = 'Invalid outputs data';
			}
		}

		// Include error if status is failed
		if (session.status === 'failed' && session.error) {
			response.error = session.error;
		}

		// Log status for debugging
		console.log('[Preview Status]', {
			previewSessionId,
			status: session.status,
			hasOutputs: !!response.outputs,
			error: response.error,
		});

		return NextResponse.json(response);
	} catch (error: any) {
		console.error('[Preview Status] Error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
