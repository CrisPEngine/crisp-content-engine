import type { ArticleRecord } from '@/lib/articles/types';

export type DraftNext = {
	kind: 'import' | 'revise' | 'generate' | 'continue' | 'blocked';
	label: string;
	detail: string;
	available: boolean;
};

type LexicalNode = {
	type?: string;
	text?: string;
	tag?: string;
	format?: number | string;
	url?: string;
	listType?: string;
	fields?: { url?: string };
	children?: LexicalNode[];
};

function inline(nodes: LexicalNode[] | undefined): string {
	return (nodes ?? []).map((node) => {
		if (node.type === 'text') {
			let text = node.text ?? '';
			const format = Number(node.format ?? 0);
			if (format & 1) text = `**${text}**`;
			if (format & 2) text = `*${text}*`;
			return text;
		}
		if (node.type === 'linebreak') return '\n';
		if (node.type === 'link') {
			const label = inline(node.children);
			const url = node.fields?.url || node.url || '';
			return url ? `[${label}](${url})` : label;
		}
		if (node.type === 'paragraph' || node.type === 'listitem') return inline(node.children);
		return inline(node.children);
	}).join('');
}

function renderBlock(node: LexicalNode): string {
	if (node.type === 'heading') {
		const level = node.tag === 'h1' ? '#' : node.tag === 'h3' ? '###' : node.tag === 'h4' ? '####' : '##';
		return `${level} ${inline(node.children).trim()}`;
	}
	if (node.type === 'list') {
		const ordered = node.listType === 'number';
		return (node.children ?? []).map((item, index) => {
			const text = inline(item.children).trim();
			return `${ordered ? `${index + 1}. ` : '- '}${text}`;
		}).join('\n');
	}
	if (node.type === 'quote') return `> ${inline(node.children).trim()}`;
	if (node.type === 'paragraph') return inline(node.children).trim();
	return inline(node.children).trim();
}

/** Converts a Payload article document into markdown. The page title stays out of the body. */
export function payloadDocumentToMarkdown(document: { layout?: unknown }): string {
	const layout = Array.isArray(document.layout) ? document.layout : [];
	const parts: string[] = [];
	for (const block of layout) {
		if (!block || typeof block !== 'object') continue;
		const entry = block as { blockType?: string; content?: { root?: { children?: LexicalNode[] } }; items?: Array<{ question?: string; answer?: unknown }> };
		if (entry.blockType === 'richText') {
			for (const child of entry.content?.root?.children ?? []) {
				const line = renderBlock(child);
				if (line.trim()) parts.push(line.trim());
			}
		}
		if (entry.blockType === 'faq') {
			for (const item of entry.items ?? []) {
				const question = item.question?.trim() ?? '';
				const answer = typeof item.answer === 'string'
					? item.answer.trim()
					: item.answer && typeof item.answer === 'object'
						? renderBlock(item.answer as LexicalNode).trim()
						: '';
				if (question) parts.push(`## ${question}`);
				if (answer) parts.push(answer);
			}
		}
	}
	return parts.join('\n\n').trim();
}

export function hasRemotePublication(article: ArticleRecord): boolean {
	return Boolean(article.library?.cms?.payloadId || article.library?.canonicalUrl || article.publication?.url);
}

export function remoteRevisionOf(article: ArticleRecord): number | null {
	return article.workspace?.cms.sync?.remoteRevision ?? article.workspace?.cms.revision ?? article.library?.cms?.revision ?? null;
}

export function isPublishedBaseline(article: ArticleRecord): boolean {
	const revision = article.workspace?.revision;
	return Boolean(article.body.trim() && (revision?.kind === 'baseline' || revision?.source === 'baseline'));
}

/** Approval of a local content revision. A catalogue publication flag is not one. */
export function contentRevisionApproved(article: ArticleRecord): boolean {
	if (article.approval.status !== 'approved' || !article.body.trim() || isPublishedBaseline(article)) return false;
	const approved = article.workspace?.approvedRevisionId;
	const current = article.workspace?.revision?.id;
	if (approved && current) return approved === current;
	return !approved;
}

export function localStatusLabel(article: ArticleRecord): string {
	if (!article.body.trim() && hasRemotePublication(article)) return 'Published remotely';
	if (isPublishedBaseline(article)) return 'Baseline imported';
	if (article.status === 'review') return 'Working draft';
	return article.status;
}

export function draftNextAction(article: ArticleRecord): DraftNext {
	const workspace = article.workspace;
	if (!workspace?.briefApprovedAt) {
		return { kind: 'blocked', label: 'Approve the brief', detail: 'Approve the brief first.', available: false };
	}
	if (workspace.research?.status === 'changed_since_approval') {
		return { kind: 'blocked', label: 'Approve the research', detail: 'Research changed since approval. Approve the current version first.', available: false };
	}
	if (workspace.research?.status !== 'approved') {
		return { kind: 'blocked', label: 'Approve the research', detail: 'Approve the research first.', available: false };
	}
	const remote = hasRemotePublication(article);
	const remoteRevision = remoteRevisionOf(article);
	const baselineRevision = workspace.cms.baselineRevision ?? null;
	const remoteChanged = typeof remoteRevision === 'number' && typeof baselineRevision === 'number' && remoteRevision !== baselineRevision;
	if (!article.body.trim()) {
		if (remote && workspace.cms.remoteBodyState === 'empty') {
			return {
				kind: 'generate',
				label: 'Generate Draft',
				detail: 'The published page has no content. Generate a first draft from the approved brief and research. It stays unapproved until you approve it, and the live page is not changed.',
				available: true,
			};
		}
		if (remote) {
			return {
				kind: 'import',
				label: 'Import published article',
				detail: 'Published article, not yet imported. Import the published article to begin a revision. The live page is not changed.',
				available: true,
			};
		}
		return {
			kind: 'generate',
			label: 'Generate Draft',
			detail: 'New article with approved research. Generate the first draft. Nothing is published.',
			available: true,
		};
	}
	if (remoteChanged && isPublishedBaseline(article)) {
		return {
			kind: 'import',
			label: 'Import published article',
			detail: `Remote changes detected. Payload revision is ${remoteRevision}. The local baseline is revision ${baselineRevision}. Import the current published article before revising. The live page is not changed.`,
			available: true,
		};
	}
	if (remoteChanged) {
		return {
			kind: 'blocked',
			label: 'Remote changes detected',
			detail: `Payload revision is ${remoteRevision}. This working draft was prepared against revision ${baselineRevision}. Publishing is refused until that conflict is resolved. The live page was not changed.`,
			available: false,
		};
	}
	if (isPublishedBaseline(article)) {
		return {
			kind: 'revise',
			label: 'Create revised draft',
			detail: 'Published article with an imported baseline. Create a revised draft using the approved brief and research. The published baseline stays in revision history, and the new revision is not approved.',
			available: true,
		};
	}
	if (contentRevisionApproved(article)) {
		return {
			kind: 'blocked',
			label: 'Revision approved',
			detail: 'This local revision is approved. Start a new working revision before replacing it. The published page stays as it is.',
			available: false,
		};
	}
	return {
		kind: 'continue',
		label: 'Continue editing',
		detail: 'A working revision is saved. Continue editing or run editorial review. Nothing is published from this page.',
		available: true,
	};
}

export function preparePublishedImport(
	article: ArticleRecord,
	remote: { markdown: string; revision: number | null; updatedAt: string | null; description?: string; payloadId: string },
): { imported: boolean; empty: boolean } {
	const workspace = article.workspace;
	if (!workspace) throw new Error('Article workspace is missing.');
	if (article.body.trim() && !isPublishedBaseline(article)) {
		throw new Error('A working draft already exists. The published article was not imported over it.');
	}
	workspace.cms.revision = remote.revision;
	workspace.cms.baselineRevision = remote.revision;
	workspace.cms.sync = {
		state: 'published',
		remoteRevision: remote.revision,
		localRevision: workspace.revision?.number ?? null,
		localChangesPending: false,
		remoteChanged: false,
		checkedAt: new Date().toISOString(),
		flag: 'The published page was read. It was not changed.',
	};
	if (!remote.markdown.trim()) {
		workspace.cms.remoteBodyState = 'empty';
		return { imported: false, empty: true };
	}
	workspace.cms.remoteBodyState = 'present';
	if (article.library?.cms) {
		article.library.cms.revision = remote.revision;
		article.library.cms.updatedAt = remote.updatedAt;
		article.library.cms.payloadId = remote.payloadId;
		if (remote.description) article.library.cms.description = remote.description;
	}
	return { imported: true, empty: false };
}
