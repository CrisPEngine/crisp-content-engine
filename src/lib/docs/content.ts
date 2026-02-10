import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

import type { DocFrontmatter, DocHeading, DocMeta, DocsNavSection, DocsSearchItem } from './types';

const DOCS_ROOT = path.join(process.cwd(), 'content', 'docs');

const SECTION_ORDER: Record<string, number> = {
	Overview: 0,
	'Getting Started': 10,
	Publishing: 20,
	'Content System': 30,
	'Security & Privacy': 40,
	Integrations: 50,
	FAQ: 60,
	Changelog: 70,
};

function slugToHref(slug: string[]): string {
	if (!slug.length) return '/docs';
	return `/docs/${slug.join('/')}`;
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.stat(p);
		return true;
	} catch {
		return false;
	}
}

function slugFromDocFile(absPath: string): string[] {
	const rel = path.relative(DOCS_ROOT, absPath).replaceAll(path.sep, '/');
	const noExt = rel.replace(/\.mdx?$/, '');
	const parts = noExt.split('/').filter(Boolean);
	// support folder index.mdx
	if (parts.at(-1) === 'index') parts.pop();
	return parts;
}

async function listDocFiles(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const results: string[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await listDocFiles(abs)));
			continue;
		}
		if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
			results.push(abs);
		}
	}

	return results;
}

function normalizeFrontmatter(input: unknown, slug: string[]): DocFrontmatter {
	const fm = (input || {}) as Partial<DocFrontmatter>;

	const title = typeof fm.title === 'string' ? fm.title.trim() : '';
	const description = typeof fm.description === 'string' ? fm.description.trim() : '';
	const section = typeof fm.section === 'string' ? fm.section.trim() : '';
	const order = typeof fm.order === 'number' ? fm.order : Number(fm.order);

	if (!title || !description || !section || Number.isNaN(order)) {
		throw new Error(
			`Invalid docs frontmatter for slug "${slug.join('/') || 'index'}". Required: title, description, section, order.`,
		);
	}

	return { title, description, section, order };
}

export function slugifyHeading(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/[`"'()[\]{}]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function extractHeadingsFromSource(source: string): DocHeading[] {
	const headings: DocHeading[] = [];
	const lines = source.split('\n');

	for (const line of lines) {
		const h2 = line.match(/^##\s+(.+?)\s*$/);
		if (h2?.[1]) {
			const text = h2[1].replace(/\*\*/g, '').trim();
			headings.push({ level: 2, text, id: slugifyHeading(text) });
			continue;
		}

		const h3 = line.match(/^###\s+(.+?)\s*$/);
		if (h3?.[1]) {
			const text = h3[1].replace(/\*\*/g, '').trim();
			headings.push({ level: 3, text, id: slugifyHeading(text) });
		}
	}

	return headings;
}

function stripMarkdownToText(source: string): string {
	return (
		source
			// code fences
			.replace(/```[\s\S]*?```/g, ' ')
			// inline code
			.replace(/`([^`]+)`/g, '$1')
			// links
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			// emphasis
			.replace(/[*_~]/g, '')
			// headings / lists
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/^\s*[-*+]\s+/gm, '')
			.replace(/^\s*\d+\.\s+/gm, '')
			// blockquotes
			.replace(/^\s*>\s?/gm, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

async function resolveDocFilePath(slug: string[]): Promise<string | null> {
	// /docs → content/docs/index.mdx
	if (!slug.length) {
		const p1 = path.join(DOCS_ROOT, 'index.mdx');
		const p2 = path.join(DOCS_ROOT, 'index.md');
		if (await pathExists(p1)) return p1;
		if (await pathExists(p2)) return p2;
		return null;
	}

	const base = path.join(DOCS_ROOT, ...slug);
	const candidates = [
		`${base}.mdx`,
		`${base}.md`,
		path.join(base, 'index.mdx'),
		path.join(base, 'index.md'),
	];

	for (const c of candidates) {
		if (await pathExists(c)) return c;
	}
	return null;
}

let _metaCache: Promise<DocMeta[]> | null = null;

export async function getAllDocsMeta(): Promise<DocMeta[]> {
	if (_metaCache) return _metaCache;

	_metaCache = (async () => {
		const files = await listDocFiles(DOCS_ROOT);
		const metas: DocMeta[] = [];

		for (const absPath of files) {
			const slug = slugFromDocFile(absPath);
			const raw = await fs.readFile(absPath, 'utf8');
			const parsed = matter(raw);
			const fm = normalizeFrontmatter(parsed.data, slug);
			metas.push({
				...fm,
				slug,
				href: slugToHref(slug),
			});
		}

		metas.sort((a, b) => {
			const sa = SECTION_ORDER[a.section] ?? 999;
			const sb = SECTION_ORDER[b.section] ?? 999;
			if (sa !== sb) return sa - sb;
			if (a.order !== b.order) return a.order - b.order;
			return a.title.localeCompare(b.title);
		});

		return metas;
	})();

	return _metaCache;
}

export async function getDocsNav(): Promise<DocsNavSection[]> {
	const metas = await getAllDocsMeta();
	const bySection = new Map<string, DocMeta[]>();

	for (const meta of metas) {
		// Hide landing page from sidebar sections; we link to it in header.
		if (!meta.slug.length) continue;
		const arr = bySection.get(meta.section) || [];
		arr.push(meta);
		bySection.set(meta.section, arr);
	}

	const sections = Array.from(bySection.entries()).map(([title, items]) => ({
		title,
		items: [...items].sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return a.title.localeCompare(b.title);
		}),
	}));

	sections.sort((a, b) => (SECTION_ORDER[a.title] ?? 999) - (SECTION_ORDER[b.title] ?? 999));
	return sections;
}

export async function getDocsPrevNext(slug: string[]): Promise<{ prev?: DocMeta; next?: DocMeta }> {
	const metas = await getAllDocsMeta();
	const href = slugToHref(slug);
	const idx = metas.findIndex((m) => m.href === href);
	if (idx === -1) return {};
	return {
		prev: metas[idx - 1],
		next: metas[idx + 1],
	};
}

export async function getDocsSearchIndex(): Promise<DocsSearchItem[]> {
	const metas = await getAllDocsMeta();
	const items: DocsSearchItem[] = [];

	for (const meta of metas) {
		const absPath = await resolveDocFilePath(meta.slug);
		if (!absPath) continue;
		const raw = await fs.readFile(absPath, 'utf8');
		const parsed = matter(raw);
		const bodyText = stripMarkdownToText(parsed.content).slice(0, 280);
		items.push({
			href: meta.href,
			title: meta.title,
			description: meta.description,
			section: meta.section,
			keywords: bodyText,
		});
	}

	return items;
}

export async function loadDocBySlug(slug: string[]): Promise<{
	frontmatter: DocFrontmatter;
	slug: string[];
	href: string;
	source: string;
	headings: DocHeading[];
}> {
	const absPath = await resolveDocFilePath(slug);
	if (!absPath) {
		throw new Error(`Doc not found for slug "${slug.join('/') || 'index'}".`);
	}

	const raw = await fs.readFile(absPath, 'utf8');
	const parsed = matter(raw);
	const frontmatter = normalizeFrontmatter(parsed.data, slug);
	const headings = extractHeadingsFromSource(parsed.content);

	return {
		frontmatter,
		slug,
		href: slugToHref(slug),
		source: parsed.content,
		headings,
	};
}

export async function getAllDocSlugs(): Promise<string[][]> {
	const metas = await getAllDocsMeta();
	return metas.map((m) => m.slug);
}
