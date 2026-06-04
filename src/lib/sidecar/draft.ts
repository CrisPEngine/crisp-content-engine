import 'server-only';

import { completeStructuredJson, resolveLlmProviderId, resolveSidecarLlmModel } from '@/lib/llm';
import { LlmError } from '@/lib/llm';
import type { z } from 'zod';
import { resolveBrandProfile } from './brands';
import { logSidecarDraftFailure, logSidecarDraftStep } from './draftDiagnostics';
import { mapAirtableErrorToSidecar, mapLlmErrorToSidecar, wrapUnknownDraftError } from './draftErrors';
import { SidecarError } from './errors';
import { normalizeDraftLlmPayload } from './normalizeDraftOutput';
import { buildSidecarDraftMessages } from './promptBuilder';
import type { SidecarDraftOutput } from './schemas';
import { sidecarDraftOutputSchema, type sidecarDraftRequestSchema } from './schemas';
import { logSidecarUsage } from './storage';

type DraftRequest = z.infer<typeof sidecarDraftRequestSchema>;

function assertLlmConfigured(): void {
	const provider = resolveLlmProviderId();
	if (provider !== 'openai') {
		throw new SidecarError(`LLM provider "${provider}" is not supported for Sidecar drafts`, {
			status: 503,
			code: 'sidecar_invalid_llm_provider',
			details: { provider },
		});
	}
	if (!process.env.OPENAI_API_KEY?.trim()) {
		throw new SidecarError(
			'OpenAI is not configured on the server. Set OPENAI_API_KEY in Vercel or .env.local.',
			{ status: 503, code: 'sidecar_missing_openai_key' },
		);
	}
}

export async function generateSidecarDraft(
	ownerUserId: string,
	input: DraftRequest,
): Promise<SidecarDraftOutput & { brandId: string; brandName: string }> {
	logSidecarDraftStep('request_validated', {
		brandId: input.brandId,
		hasBrandName: Boolean(input.brand),
		platform: input.platform,
		messageType: input.messageType,
		objective: input.objective,
		ctaStrength: input.ctaStrength,
		relationshipStage: input.relationshipStage,
		hasSelectedText: Boolean(input.selectedText?.trim()),
	});

	assertLlmConfigured();

	let profile;
	try {
		profile = await resolveBrandProfile({
			ownerUserId,
			brandId: input.brandId,
			brandName: input.brand,
		});
		logSidecarDraftStep('brand_resolved', {
			brandId: profile.id,
			brandNameLength: profile.name.length,
			brandType: profile.brand_type,
		});
	} catch (error) {
		logSidecarDraftFailure('brand_resolve', error, { brandId: input.brandId });
		if (error instanceof SidecarError) throw error;
		if (error instanceof Error && error.message.includes('Airtable API error')) {
			throw mapAirtableErrorToSidecar(error, 'resolve');
		}
		throw wrapUnknownDraftError(error);
	}

	let messages;
	try {
		messages = buildSidecarDraftMessages(profile, input);
		logSidecarDraftStep('prompt_built', {
			messageCount: messages.length,
			userContentLength: messages[1]?.content.length ?? 0,
		});
	} catch (error) {
		logSidecarDraftFailure('prompt_build', error);
		throw new SidecarError('Failed to build draft prompt', {
			status: 500,
			code: 'sidecar_prompt_build_failed',
		});
	}

	const provider = resolveLlmProviderId();
	const model = resolveSidecarLlmModel();
	logSidecarDraftStep('llm_request_start', { provider, model });

	let result: SidecarDraftOutput;
	try {
		const llmResult = await completeStructuredJson<unknown>({
			model,
			messages,
			temperature: 0.7,
			maxTokens: 2048,
		});
		logSidecarDraftStep('llm_response_received', {
			provider: llmResult.provider,
			model: llmResult.model,
			outputKeys: Object.keys((llmResult.data as object) || {}),
		});

		const normalized = normalizeDraftLlmPayload(llmResult.data);
		const parsed = sidecarDraftOutputSchema.safeParse(normalized);
		if (!parsed.success) {
			logSidecarDraftFailure('schema_validation', parsed.error, {
				issueCount: parsed.error.issues.length,
				issuePaths: parsed.error.issues.map((i) => i.path.join('.')),
			});
			throw new SidecarError('Draft output failed validation', {
				status: 502,
				code: 'sidecar_schema_validation_failed',
				details: parsed.error.issues,
			});
		}
		result = parsed.data;
		logSidecarDraftStep('schema_validated', { fitScore: result.fitScore });
	} catch (error) {
		if (error instanceof SidecarError) throw error;
		logSidecarDraftFailure('llm_or_parse', error, { provider, model });
		if (error instanceof LlmError) throw mapLlmErrorToSidecar(error);
		throw wrapUnknownDraftError(error);
	}

	await logSidecarUsage({
		userId: ownerUserId,
		brand: profile.name,
		platform: input.platform,
		action: 'draft_generated',
		messageType: input.messageType,
		objective: input.objective,
		metadata: { model, brandId: profile.id },
	}).catch((usageError) => {
		logSidecarDraftFailure('usage_log_non_blocking', usageError);
	});

	logSidecarDraftStep('draft_complete', { brandId: profile.id });

	return {
		...result,
		brandId: profile.id,
		brandName: profile.name,
	};
}
