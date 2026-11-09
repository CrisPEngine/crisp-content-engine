import { createHash, randomUUID } from 'crypto';
import { applyGeneratedMetadata, generateArticleMetadata } from './seoMetadata';
import { articleWordCount, parseSections, stripCmsTitleHeading } from './structure';
import type { ArticleRecord, ArticleRevisionRef, ArticleSection } from './types';

export function contentHash(body: string): string {
	return createHash('sha256').update(body.replace(/\r\n/g, '\n').trim()).digest('hex');
}

/** Returns the revision for the current body, recording a legacy revision for articles saved before revisions existed. */
export function ensureRevision(article: ArticleRecord): ArticleRevisionRef | null {
	const workspace = article.workspace;
	if (!workspace) return null;
	if (!article.body.trim()) return workspace.revision ?? null;
	const hash = contentHash(article.body);
	if (workspace.revision && workspace.revision.contentHash === hash) return workspace.revision;
	const priorNumbers = article.versions.map((version) => version.number ?? 0);
	const number = Math.max(workspace.revision?.number ?? 0, ...priorNumbers, 0) + 1;
	workspace.revision = {
		id: randomUUID(),
		number,
		contentHash: hash,
		wordCount: articleWordCount(article.body),
		createdAt: article.updatedAt,
		source: workspace.revision ? 'manual' : 'legacy',
		note: workspace.revision ? 'Body changed outside a recorded revision.' : 'Recorded from the existing article body.',
	};
	return workspace.revision;
}

function syncSections(article: ArticleRecord, body: string): ArticleSection[] {
	return parseSections(body).map((section, index) => {
		const previous = article.sections.find((item) => item.heading === section.heading) ?? article.sections[index];
		return {
			id: previous?.heading === section.heading ? previous.id : randomUUID(),
			heading: section.heading,
			purpose: previous?.heading === section.heading ? previous.purpose : '',
			body: section.body,
			claims: previous?.heading === section.heading ? previous.claims : [],
		};
	});
}

/**
 * Saves a new body as the next revision. The previous body is kept in versions with its revision id and hash.
 * Returns the existing revision when the content is unchanged.
 */
export function commitRevision(
	article: ArticleRecord,
	body: string,
	source: ArticleRevisionRef['source'],
	note?: string,
	options?: { refreshMetadata?: boolean },
): ArticleRevisionRef {
	const workspace = article.workspace;
	if (!workspace) throw new Error('Article workspace is missing.');
	let nextBody = body.replace(/\r\n/g, '\n').trim();
	if (workspace.destinationId) nextBody = stripCmsTitleHeading(nextBody, article.title);
	const hash = contentHash(nextBody);
	const prior = ensureRevision(article);
	if (prior && prior.contentHash === hash) return prior;
	if (prior) {
		article.versions = [
			...article.versions,
			{
				body: article.body,
				createdAt: prior.createdAt,
				instruction: prior.note,
				revisionId: prior.id,
				number: prior.number,
				contentHash: prior.contentHash,
				wordCount: prior.wordCount,
				source: prior.source,
			},
		];
	}
	const now = new Date().toISOString();
	const revision: ArticleRevisionRef = {
		id: randomUUID(),
		number: (prior?.number ?? Math.max(0, ...article.versions.map((version) => version.number ?? 0))) + 1,
		contentHash: hash,
		wordCount: articleWordCount(nextBody),
		createdAt: now,
		source,
		note,
	};
	article.body = nextBody;
	article.wordCount = revision.wordCount;
	article.sections = syncSections(article, nextBody);
	if (options?.refreshMetadata ?? source === 'generation') {
		applyGeneratedMetadata(article, generateArticleMetadata(article));
	}
	workspace.revision = revision;
	return revision;
}

export function revisionBody(article: ArticleRecord, revisionId: string): { body: string; revision: ArticleRevisionRef } | null {
	const current = article.workspace?.revision;
	if (current?.id === revisionId) return { body: article.body, revision: current };
	const version = article.versions.find((item) => item.revisionId === revisionId);
	if (!version || !version.revisionId) return null;
	return {
		body: version.body,
		revision: {
			id: version.revisionId,
			number: version.number ?? 0,
			contentHash: version.contentHash ?? contentHash(version.body),
			wordCount: version.wordCount ?? articleWordCount(version.body),
			createdAt: version.createdAt,
			source: version.source ?? 'legacy',
			note: version.instruction,
		},
	};
}

export function listRevisions(article: ArticleRecord): ArticleRevisionRef[] {
	const past = article.versions
		.filter((version) => version.revisionId)
		.map((version) => ({
			id: version.revisionId as string,
			number: version.number ?? 0,
			contentHash: version.contentHash ?? contentHash(version.body),
			wordCount: version.wordCount ?? articleWordCount(version.body),
			createdAt: version.createdAt,
			source: version.source ?? ('legacy' as const),
			note: version.instruction,
		}));
	const current = article.workspace?.revision;
	return [...past, ...(current ? [current] : [])].sort((a, b) => b.number - a.number);
}
