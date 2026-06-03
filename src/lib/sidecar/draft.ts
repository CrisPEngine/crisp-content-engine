import 'server-only';

import { completeStructuredJson, resolveSidecarLlmModel } from '@/lib/llm';
import { LlmError } from '@/lib/llm';
import type { z } from 'zod';
import { resolveBrandProfile } from './brands';
import { SidecarError } from './errors';
import { buildSidecarDraftMessages } from './promptBuilder';
import type { SidecarDraftOutput } from './schemas';
import { sidecarDraftOutputSchema, type sidecarDraftRequestSchema } from './schemas';
import { logSidecarUsage } from './storage';

type DraftRequest = z.infer<typeof sidecarDraftRequestSchema>;

export async function generateSidecarDraft(
	ownerUserId: string,
	input: DraftRequest,
): Promise<SidecarDraftOutput & { brandId: string; brandName: string }> {
	const profile = await resolveBrandProfile({
		ownerUserId,
		brandId: input.brandId,
		brandName: input.brand,
	});

	const messages = buildSidecarDraftMessages(profile, input);
	const model = resolveSidecarLlmModel();

	let result: SidecarDraftOutput;
	try {
		const llmResult = await completeStructuredJson<unknown>({
			model,
			messages,
			temperature: 0.7,
			maxTokens: 2048,
		});
		const parsed = sidecarDraftOutputSchema.safeParse(llmResult.data);
		if (!parsed.success) {
			throw new SidecarError('Draft output failed validation', {
				status: 502,
				code: 'sidecar_draft_invalid_output',
				details: parsed.error.issues,
			});
		}
		result = parsed.data;
	} catch (error) {
		if (error instanceof SidecarError) throw error;
		if (error instanceof LlmError) {
			throw new SidecarError(error.message, {
				status: error.status ?? 502,
				code: error.code,
			});
		}
		throw error;
	}

	await logSidecarUsage({
		userId: ownerUserId,
		brand: profile.name,
		platform: input.platform,
		action: 'draft_generated',
		messageType: input.messageType,
		objective: input.objective,
		metadata: { model, brandId: profile.id },
	}).catch(() => {
		/* non-blocking */
	});

	return {
		...result,
		brandId: profile.id,
		brandName: profile.name,
	};
}
