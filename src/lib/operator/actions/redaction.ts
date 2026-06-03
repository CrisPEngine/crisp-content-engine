import type { OperatorActionRequest } from './schemas';

const SENSITIVE_KEY_PATTERN = /authorization|api[-_]?key|secret|token|password|cookie|webhook|email/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/-]+=*/gi;

function redactString(value: string) {
	return value
		.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
		.replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');
}

export function redactValue(value: unknown, depth = 0): unknown {
	if (depth > 5) return '[REDACTED_DEPTH]';
	if (value === null || value === undefined) return value;
	if (typeof value === 'string') return redactString(value);
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
	if (typeof value !== 'object') return '[REDACTED_VALUE]';

	const output: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
		if (SENSITIVE_KEY_PATTERN.test(key)) {
			output[key] = '[REDACTED]';
			continue;
		}
		output[key] = redactValue(nestedValue, depth + 1);
	}
	return output;
}

export function summarizeOperatorInput(request: OperatorActionRequest): Record<string, unknown> {
	const input = request.input as Record<string, unknown> | undefined;
	const profile = input?.profile && typeof input.profile === 'object'
		? input.profile as Record<string, unknown>
		: undefined;

	return {
		action: request.action,
		dryRun: request.dryRun,
		brandProfileId: input?.brandProfileId,
		contentId: input?.contentId,
		userId: input?.userId ? '[PRESENT]' : undefined,
		platform: input?.platform,
		status: input?.status,
		mode: input?.mode,
		triggerType: input?.triggerType,
		hasProfile: Boolean(profile),
		profileFields: profile ? Object.keys(profile).sort() : undefined,
	};
}

export function summarizeOperatorResult(result: unknown): Record<string, unknown> | undefined {
	if (!result || typeof result !== 'object') return undefined;
	const value = result as Record<string, unknown>;
	const summary: Record<string, unknown> = {
		provider: value.provider,
		recordId: value.recordId,
		message: value.message,
	};

	if (Array.isArray(value.items)) {
		summary.itemCount = value.items.length;
	}
	if (value.response && typeof value.response === 'object') {
		const response = value.response as Record<string, unknown>;
		summary.response = {
			status: response.status,
			count: response.count,
		};
	}
	if (value.webhook && typeof value.webhook === 'object') {
		summary.webhook = summarizeOperatorResult(value.webhook);
	}
	if (value.statusUpdate && typeof value.statusUpdate === 'object') {
		summary.statusUpdate = summarizeOperatorResult(value.statusUpdate);
	}

	return redactValue(summary) as Record<string, unknown>;
}

export function safeOperatorResult(result: unknown): unknown {
	if (!result || typeof result !== 'object') return result;
	const value = result as Record<string, unknown>;
	const safe: Record<string, unknown> = {
		provider: value.provider,
		recordId: value.recordId,
		message: value.message,
	};

	if (Array.isArray(value.items)) {
		safe.items = value.items.map((item) => {
			if (!item || typeof item !== 'object') return item;
			const contentItem = item as Record<string, unknown>;
			return {
				id: contentItem.id,
				title: contentItem.title,
				platform: contentItem.platform,
				status: contentItem.status,
				scheduled_time: contentItem.scheduled_time,
				published_at: contentItem.published_at,
				brand_profile_id: contentItem.brand_profile_id,
				created_time: contentItem.created_time,
				updated_time: contentItem.updated_time,
			};
		});
	}

	if (value.response && typeof value.response === 'object') {
		const response = value.response as Record<string, unknown>;
		safe.response = {
			status: response.status,
			count: response.count,
		};
	}

	if (value.payload && typeof value.payload === 'object') {
		const payload = value.payload as Record<string, unknown>;
		const body = payload.body && typeof payload.body === 'object' ? payload.body as Record<string, unknown> : undefined;
		const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields as Record<string, unknown> : undefined;
		safe.payload = {
			urlConfigured: payload.urlConfigured,
			headers: Array.isArray(payload.headers) ? payload.headers : undefined,
			bodyKeys: body ? Object.keys(body).sort() : undefined,
			operation: payload.operation,
			table: payload.table,
			fieldKeys: fields ? Object.keys(fields).sort() : undefined,
		};
	}

	if (value.webhook) {
		safe.webhook = safeOperatorResult(value.webhook);
	}
	if (value.statusUpdate) {
		safe.statusUpdate = safeOperatorResult(value.statusUpdate);
	}

	return redactValue(safe);
}
