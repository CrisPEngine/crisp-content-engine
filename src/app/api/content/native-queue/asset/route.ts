import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
import { generateAssetFromProposal } from '@/lib/media/images';
import { planMedia } from '@/lib/media/planner';
import { publicAssetsWithVision } from '@/lib/media/plannerAssets';
import { SIGNAL_WEIGHTS } from '@/lib/media/assetLearning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as {
			contentId?: string;
			action?: 'swap_library' | 'generate';
			assetId?: string;
			reason?: string;
		};
		if (!body.contentId || !body.action) {
			return NextResponse.json({ error: 'contentId and action are required.' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const native = getNativeContentStore();
		const memory = await store.getMemory(userId, body.contentId);
		if (!memory) return NextResponse.json({ error: 'Content not found.' }, { status: 404 });

		const links = await native.listLinks(userId, 'content', memory.id);
		for (const link of links) {
			await native.removeLink(userId, link.assetId, 'content', memory.id);
		}

		let linked = null as ReturnType<typeof publicAsset> | null;
		let mediaPath: 'library' | 'generated' | 'manual' = 'manual';
		let selectionReason = body.reason?.trim() ?? '';

		if (body.action === 'swap_library') {
			if (!body.assetId) return NextResponse.json({ error: 'assetId is required for swap_library.' }, { status: 400 });
			const asset = await native.getAsset(userId, body.assetId);
			if (!asset || asset.brandId !== memory.brandBrainId) {
				return NextResponse.json({ error: 'That asset is not in this brand library.' }, { status: 403 });
			}
			selectionReason = selectionReason || 'Approver chose a different library asset.';
			await native.saveLink({
				id: crypto.randomUUID(),
				ownerUserId: userId,
				assetId: asset.id,
				targetType: 'content',
				targetId: memory.id,
				selectionPath: 'library',
				selectionReason,
				matchReason: selectionReason,
				createdAt: new Date().toISOString(),
			});
			await native.saveSelectionSignal({
				id: crypto.randomUUID(),
				ownerUserId: userId,
				brandId: memory.brandBrainId,
				assetId: asset.id,
				contentId: memory.id,
				channel: String(memory.channel),
				signalType: 'swap',
				weight: SIGNAL_WEIGHTS.swap,
				note: selectionReason,
				createdAt: new Date().toISOString(),
			});
			linked = publicAsset(asset);
			mediaPath = 'library';
		} else if (body.action === 'generate') {
			const rawAssets = await native.listAssets(userId, memory.brandBrainId);
			const { publicAssets: assets } = publicAssetsWithVision(rawAssets);
			const decision = planMedia({
				channel: String(memory.channel),
				topic: memory.topic ?? memory.hook ?? '',
				assets,
			});
			const generated = await generateAssetFromProposal({
				ownerUserId: userId,
				credentialId: 'ui-session',
				brandId: memory.brandBrainId,
				targetType: 'content',
				targetId: memory.id,
				decision,
				rateLimit: {},
				channel: String(memory.channel),
				topic: memory.topic ?? undefined,
				excerpt: memory.body?.slice(0, 400),
				explicitRequest: true,
			});
			const newLinks = await native.listLinks(userId, 'content', memory.id);
			const last = newLinks.at(-1);
			if (last) {
				await native.saveLink({
					...last,
					selectionPath: 'generated',
					selectionReason: decision.reason,
				});
			}
			linked = generated.asset;
			mediaPath = 'generated';
			selectionReason = decision.reason;
		}

		await store.saveMemory(userId, {
			...memory,
			metadata: {
				...(memory.metadata ?? {}),
				mediaPath,
				mediaSelectionReason: selectionReason,
				linkedAssetId: linked?.id,
			},
		});

		return NextResponse.json({
			contentId: memory.id,
			linkedAsset: linked,
			mediaPath,
			mediaSelectionReason: selectionReason,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Request failed';
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
