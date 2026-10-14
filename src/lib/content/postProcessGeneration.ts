import { sanitizeContentFields, sanitizeText } from './dashSanitizer';

export function postProcessWriterDraft<T extends { draft?: string; hook?: string; argument?: string; cta?: string; topic?: string }>(
	data: T,
): T {
	const sanitized = sanitizeContentFields({
		body: data.draft ?? '',
		hook: data.hook,
		argument: data.argument,
		cta: data.cta,
		title: data.topic,
	});
	return {
		...data,
		...(data.draft !== undefined ? { draft: sanitized.body } : {}),
		...(data.hook !== undefined && sanitized.hook !== undefined ? { hook: sanitized.hook } : {}),
		...(data.argument !== undefined && sanitized.argument !== undefined ? { argument: sanitized.argument } : {}),
		...(data.cta !== undefined && sanitized.cta !== undefined ? { cta: sanitized.cta } : {}),
		...(data.topic !== undefined && sanitized.title !== undefined ? { topic: sanitized.title } : {}),
	};
}

export function postProcessPlainDraft(text: string): string {
	return sanitizeText(text);
}

export function postProcessIdeaEngineItem(item: {
	post_title?: string | null;
	hook?: string | null;
	body_draft?: string | null;
	hashtags?: string | null;
}): typeof item {
	const body = item.body_draft ?? '';
	const sanitized = sanitizeContentFields({
		body,
		title: item.post_title ?? item.hook ?? undefined,
		hook: item.hook ?? undefined,
	});
	const hashtags = item.hashtags ? sanitizeText(item.hashtags) : item.hashtags;
	return {
		...item,
		body_draft: sanitized.body,
		...(sanitized.title != null ? { post_title: sanitized.title } : {}),
		...(sanitized.hook != null ? { hook: sanitized.hook } : {}),
		hashtags,
	};
}
