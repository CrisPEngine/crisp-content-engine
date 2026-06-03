import { createDefaultOperatorAdapters, type OperatorAdapters } from '../adapters';
import { OperatorActionError, toOperatorActionError } from './errors';
import {
	completeOperatorActionLog,
	failOperatorActionLog,
	listOperatorActionLogs,
	startOperatorActionLog,
	type OperatorActor,
	type OperatorRequestContext,
} from './logger';
import {
	completeIdempotencyKey,
	createRequestHash,
	failIdempotencyKey,
	getSuccessfulIdempotentResponse,
	isMutatingOperatorAction,
	reserveIdempotencyKey,
} from './idempotency';
import { safeOperatorResult, summarizeOperatorInput, summarizeOperatorResult } from './redaction';
import type { OperatorActionRequest, OperatorActionResponse } from './schemas';

function targetForRequest(request: OperatorActionRequest): Record<string, string | undefined> {
	const input = request.input as Partial<{ brandProfileId: string; contentId: string; userId: string }> | undefined;
	return {
		brandProfileId: input?.brandProfileId,
		contentId: input?.contentId,
		userId: input?.userId,
	};
}

function resultSummary(result: unknown) {
	if (!result || typeof result !== 'object') return undefined;
	const value = result as Record<string, unknown>;
	return {
		provider: typeof value.provider === 'string' ? value.provider : undefined,
		recordId: typeof value.recordId === 'string' ? value.recordId : undefined,
		message: typeof value.message === 'string' ? value.message : undefined,
		itemCount: Array.isArray(value.items) ? value.items.length : undefined,
	};
}

export async function runOperatorAction(
	request: OperatorActionRequest,
	actor: OperatorActor,
	context: OperatorRequestContext,
	adapters: OperatorAdapters = createDefaultOperatorAdapters()
): Promise<OperatorActionResponse> {
	const startedAt = Date.now();
	const target = targetForRequest(request);
	const startedLog = await startOperatorActionLog({
		action: request.action,
		actor,
		dryRun: request.dryRun,
		request: context,
		brandProfileId: target.brandProfileId,
		contentId: target.contentId,
		inputSummary: summarizeOperatorInput(request),
		metadata: {
			idempotencyKey: request.idempotencyKey,
		},
	});

	try {
		const idempotencyKey = context.idempotencyKey || request.idempotencyKey;
		if (!request.dryRun && idempotencyKey && isMutatingOperatorAction(request.action)) {
			const cachedResponse = await getSuccessfulIdempotentResponse(request.action, idempotencyKey);
			if (cachedResponse) {
				await completeOperatorActionLog({
					id: startedLog.id,
					durationMs: Date.now() - startedAt,
					outputSummary: summarizeOperatorResult(cachedResponse.result),
					result: cachedResponse.result,
					metadata: {
						idempotencyReplay: true,
						originalActionLogId: cachedResponse.actionLogId,
					},
				});
				return {
					...cachedResponse,
					actionLogId: startedLog.id,
					idempotentReplay: true,
				};
			}

			const reservedResponse = await reserveIdempotencyKey({
				action: request.action,
				idempotencyKey,
				requestHash: createRequestHash({ action: request.action, input: request.input }),
				actor,
				requestId: context.requestId,
				actionLogId: startedLog.id,
			});

			if (reservedResponse) {
				await completeOperatorActionLog({
					id: startedLog.id,
					durationMs: Date.now() - startedAt,
					outputSummary: summarizeOperatorResult(reservedResponse.result),
					result: reservedResponse.result,
					metadata: {
						idempotencyReplay: true,
						originalActionLogId: reservedResponse.actionLogId,
					},
				});
				return {
					...reservedResponse,
					actionLogId: startedLog.id,
					idempotentReplay: true,
				};
			}
		}

		let result: unknown;

		switch (request.action) {
			case 'create_or_update_brand_profile':
				result = await adapters.brands.createOrUpdateBrandProfile(request.input, request.dryRun);
				break;
			case 'generate_or_refresh_brand_strategy': {
				const brand = await adapters.brands.getBrandProfile(request.input.brandProfileId);
				result = await adapters.make.generateOrRefreshBrandStrategy(request.input, brand, request.dryRun);
				break;
			}
			case 'generate_content_batch': {
				const brand = await adapters.brands.getBrandProfile(request.input.brandProfileId);
				if (!brand.fields?.strategy_json && !brand.fields?.strategy_payload) {
					throw new OperatorActionError('Brand profile does not have an approved strategy payload', {
						status: 400,
						code: 'operator_missing_brand_strategy',
					});
				}
				result = await adapters.make.generateContentBatch(request.input, brand, request.dryRun);
				break;
			}
			case 'regenerate_individual_post': {
				const content = await adapters.content.getContentItem(request.input.contentId);
				const webhookResult = await adapters.make.regenerateIndividualPost(request.input, content, request.dryRun);
				const statusResult = await adapters.content.updateContentStatus(
					{
						contentId: request.input.contentId,
						status: 'Needs Review',
						notes: request.input.feedback,
					},
					request.dryRun
				);
				result = {
					provider: 'make',
					message: 'Content regeneration requested',
					webhook: webhookResult,
					statusUpdate: statusResult,
				};
				break;
			}
			case 'update_content_status':
				result = await adapters.content.updateContentStatus(request.input, request.dryRun);
				break;
			case 'send_item_to_approval':
				result = await adapters.content.sendItemToApproval(request.input, request.dryRun);
				break;
			case 'schedule_approved_content':
				{
					const content = await adapters.content.getContentItem(request.input.contentId);
					const status = content.fields?.status;
					if (status !== 'Ready To Publish' && status !== 'Scheduled') {
						throw new OperatorActionError('Content must be Ready To Publish before scheduling', {
							status: 400,
							code: 'operator_content_not_approved',
							details: { currentStatus: status },
						});
					}
				}
				result = await adapters.content.scheduleApprovedContent(request.input, request.dryRun);
				break;
			case 'fetch_brand_content_queue':
				result = await adapters.content.fetchBrandContentQueue(request.input);
				break;
			case 'fetch_operator_logs':
				result = {
					provider: 'native',
					items: await listOperatorActionLogs(request.input),
					message: 'Operator logs fetched',
				};
				break;
		}

		const safeResult = safeOperatorResult(result);
		const response: OperatorActionResponse = {
			ok: true,
			action: request.action,
			dryRun: request.dryRun,
			actionLogId: startedLog.id,
			result: safeResult,
		};

		await completeOperatorActionLog({
			id: startedLog.id,
			durationMs: Date.now() - startedAt,
			outputSummary: summarizeOperatorResult(safeResult),
			result: safeResult,
			metadata: resultSummary(safeResult),
		});

		await completeIdempotencyKey({
			action: request.action,
			idempotencyKey: context.idempotencyKey || request.idempotencyKey,
			response,
		});

		return response;
	} catch (error) {
		const operatorError = toOperatorActionError(error);

		await failOperatorActionLog({
			id: startedLog.id,
			durationMs: Date.now() - startedAt,
			error: {
				code: operatorError.code,
				message: operatorError.message,
				details: operatorError.details,
			},
		});

		await failIdempotencyKey({
			action: request.action,
			idempotencyKey: context.idempotencyKey || request.idempotencyKey,
			errorCode: operatorError.code,
			errorMessage: operatorError.message,
		});

		throw operatorError;
	}
}
