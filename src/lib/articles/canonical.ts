import type { Content, PhrasingContent, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { sourcesForPublication } from './publicSources';
import { articleWordCount } from './structure';
import type { ArticleRecord } from './types';

/**
 * The CMS-independent article. CCE stores the body as Markdown; this model is derived from it so each destination
 * adapter can map, validate and preview the same structure.
 */

export type CanonicalInline =
	| { type: 'text'; value: string; marks: Array<'bold' | 'italic' | 'code' | 'strike'> }
	| { type: 'link'; url: string; children: CanonicalInline[] }
	| { type: 'image'; url: string; alt: string }
	| { type: 'break' };

export type CanonicalBlock =
	| { type: 'heading'; level: number; children: CanonicalInline[] }
	| { type: 'paragraph'; children: CanonicalInline[] }
	| { type: 'list'; ordered: boolean; start: number; items: CanonicalBlock[][] }
	| { type: 'table'; header: CanonicalInline[][]; rows: CanonicalInline[][][] }
	| { type: 'quote'; children: CanonicalBlock[] }
	| { type: 'code'; lang: string | null; value: string }
	| { type: 'rule' }
	| { type: 'html'; value: string };

export type CanonicalArticle = {
	title: string;
	slug: string;
	dek: string;
	seo: { title: string; description: string; canonical: string | null; primaryKeyword: string | null };
	searchIntent: string;
	contentType: string;
	category: { id: string; name: string | null } | null;
	tags: string[];
	author: string | null;
	cta: string | null;
	hero: { url: string | null; alt: string };
	sources: Array<{ title: string; url: string }>;
	blocks: CanonicalBlock[];
	links: Array<{ url: string; text: string }>;
	wordCount: number;
};

function inline(nodes: PhrasingContent[] | undefined, marks: Array<'bold' | 'italic' | 'code' | 'strike'> = []): CanonicalInline[] {
	const out: CanonicalInline[] = [];
	for (const node of nodes ?? []) {
		if (node.type === 'text') out.push({ type: 'text', value: node.value, marks });
		else if (node.type === 'strong') out.push(...inline(node.children, [...marks, 'bold']));
		else if (node.type === 'emphasis') out.push(...inline(node.children, [...marks, 'italic']));
		else if (node.type === 'delete') out.push(...inline(node.children, [...marks, 'strike']));
		else if (node.type === 'inlineCode') out.push({ type: 'text', value: node.value, marks: [...marks, 'code'] });
		else if (node.type === 'link') out.push({ type: 'link', url: node.url, children: inline(node.children, marks) });
		else if (node.type === 'image') out.push({ type: 'image', url: node.url, alt: node.alt ?? '' });
		else if (node.type === 'break') out.push({ type: 'break' });
		else if (node.type === 'html') out.push({ type: 'text', value: node.value, marks });
	}
	return out;
}

function block(node: RootContent | Content): CanonicalBlock[] {
	switch (node.type) {
		case 'heading':
			return [{ type: 'heading', level: node.depth, children: inline(node.children) }];
		case 'paragraph':
			return [{ type: 'paragraph', children: inline(node.children) }];
		case 'list':
			return [
				{
					type: 'list',
					ordered: node.ordered === true,
					start: node.start ?? 1,
					items: node.children.map((item) => item.children.flatMap((child) => block(child))),
				},
			];
		case 'table': {
			const [head, ...rows] = node.children;
			return [
				{
					type: 'table',
					header: (head?.children ?? []).map((cell) => inline(cell.children)),
					rows: rows.map((row) => row.children.map((cell) => inline(cell.children))),
				},
			];
		}
		case 'blockquote':
			return [{ type: 'quote', children: node.children.flatMap((child) => block(child)) }];
		case 'code':
			return [{ type: 'code', lang: node.lang ?? null, value: node.value }];
		case 'thematicBreak':
			return [{ type: 'rule' }];
		case 'html':
			return [{ type: 'html', value: node.value }];
		default:
			return 'children' in node && Array.isArray(node.children) ? (node.children as Content[]).flatMap((child) => block(child)) : [];
	}
}

export function parseCanonicalBlocks(markdown: string): CanonicalBlock[] {
	const tree: Root = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
	return tree.children.flatMap((node) => block(node));
}

function walkInline(nodes: CanonicalInline[], visit: (node: CanonicalInline) => void) {
	for (const node of nodes) {
		visit(node);
		if (node.type === 'link') walkInline(node.children, visit);
	}
}

export function walkBlocks(blocks: CanonicalBlock[], visit: (block: CanonicalBlock, depth: number) => void, onInline?: (node: CanonicalInline) => void, depth = 0) {
	for (const item of blocks) {
		visit(item, depth);
		if (item.type === 'heading' || item.type === 'paragraph') onInline && walkInline(item.children, onInline);
		if (item.type === 'table') onInline && [...item.header, ...item.rows.flat()].forEach((cell) => walkInline(cell, onInline));
		if (item.type === 'list') item.items.forEach((entry) => walkBlocks(entry, visit, onInline, depth + 1));
		if (item.type === 'quote') walkBlocks(item.children, visit, onInline, depth + 1);
	}
}

export function inlineText(nodes: CanonicalInline[]): string {
	return nodes
		.map((node) => (node.type === 'text' ? node.value : node.type === 'link' ? inlineText(node.children) : node.type === 'image' ? node.alt : ' '))
		.join('');
}

export function toCanonicalArticle(article: ArticleRecord, taxonomy?: DestinationTaxonomy | null): CanonicalArticle {
	const blocks = parseCanonicalBlocks(article.body);
	const links: CanonicalArticle['links'] = [];
	walkBlocks(blocks, () => {}, (node) => {
		if (node.type === 'link') links.push({ url: node.url, text: inlineText(node.children) });
	});
	const categoryId = article.categories[0] ?? null;
	const workspace = article.workspace;
	return {
		title: article.title,
		slug: article.slug,
		dek: article.excerpt || article.seo.excerpt || '',
		seo: {
			title: article.seo.seoTitle || article.title,
			description: article.seo.metaDescription,
			canonical: article.seo.canonical,
			primaryKeyword: article.primaryKeyword ?? null,
		},
		searchIntent: article.searchIntent,
		contentType: workspace?.contentType ?? 'guide',
		category: categoryId ? { id: categoryId, name: taxonomy?.categories.find((item) => item.id === categoryId)?.name ?? null } : null,
		tags: article.tags,
		author: article.author ?? null,
		cta: workspace?.brief?.cta || null,
		hero: { url: workspace?.media.heroUrl ?? null, alt: workspace?.media.heroAlt ?? '' },
		sources: sourcesForPublication(article).map((source) => ({ title: source.title, url: source.url })),
		blocks,
		links,
		wordCount: articleWordCount(article.body),
	};
}
