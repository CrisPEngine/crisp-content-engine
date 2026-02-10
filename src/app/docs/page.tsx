import { loadDocBySlug, getDocsPrevNext } from '@/lib/docs/content';
import { MdxRenderer } from '@/components/docs/MdxRenderer';
import { TableOfContents } from '@/components/docs/TableOfContents';
import { PrevNext } from '@/components/docs/PrevNext';

export const dynamic = 'force-static';

export default async function DocsIndexPage() {
	const doc = await loadDocBySlug([]);
	const { prev, next } = await getDocsPrevNext([]);

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

