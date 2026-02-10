import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { loadDocBySlug, getAllDocSlugs, getDocsPrevNext } from '@/lib/docs/content';
import { MdxRenderer } from '@/components/docs/MdxRenderer';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { PrevNext } from '@/components/docs/PrevNext';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
	const slugs = await getAllDocSlugs();
	return slugs
		.filter((s) => s.length > 0)
		.map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
	const { slug } = await params;

	try {
		const doc = await loadDocBySlug(slug);
		return {
			title: `${doc.frontmatter.title} | CRISP Content Engine Docs`,
			description: doc.frontmatter.description,
			alternates: {
				canonical: doc.href,
			},
		};
	} catch {
		return {
			title: 'Docs | CRISP Content Engine',
		};
	}
}

export default async function DocsSlugPage({
	params,
}: {
	params: Promise<{ slug: string[] }>;
}) {
	const { slug } = await params;

	let doc: Awaited<ReturnType<typeof loadDocBySlug>>;
	try {
		doc = await loadDocBySlug(slug);
	} catch {
		notFound();
	}

	const { prev, next } = await getDocsPrevNext(slug);

	return (
		<div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
			<article>
				<h1 className="text-3xl font-semibold tracking-tight text-text">{doc.frontmatter.title}</h1>
				<p className="mt-3 text-lg leading-relaxed text-text-soft">{doc.frontmatter.description}</p>
				<MdxRenderer source={doc.source} />
				<PrevNext prev={prev} next={next} />
			</article>

			<aside className="hidden xl:block">
				<TableOfContents headings={doc.headings} />
			</aside>
		</div>
	);
}

