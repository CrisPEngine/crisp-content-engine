import { NextResponse } from 'next/server';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { applyDecay } from '@/lib/intelligence/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const airtableBrandId = new URL(request.url).searchParams.get('airtableBrandId');
		if (!airtableBrandId) {
			return NextResponse.json({ error: 'airtableBrandId is required' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, airtableBrandId);
		if (!brain) {
			return NextResponse.json({ error: 'Brand brain not found' }, { status: 404 });
		}
		const [learnings, edits] = await Promise.all([
			store.listLearnings(userId, brain.id),
			store.listEditLearnings(userId, brain.id),
		]);
		const active = applyDecay(learnings).filter((row) => row.validityStatus !== 'disabled' && row.validityStatus !== 'invalidated');
		return NextResponse.json({
			content: active,
			edits: edits.filter((row) => row.status !== 'disabled' && row.status !== 'rejected'),
			performance: active.filter((row) => row.scope === 'performance'),
			editorial: active.filter((row) => row.scope === 'editorial' || row.scope === 'editorial_feedback'),
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Failed to load learnings';
		return NextResponse.json({ error: message }, { status: 401 });
	}
}
