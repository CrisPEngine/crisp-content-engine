import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getAllDocsMeta, loadDocBySlug } from '@/lib/docs/content';

/**
 * Serves llms-full.txt: base llms.txt content plus full text of all doc pages
 * in one response so LLMs can get the full product + docs in a single request.
 * See: https://llmstxt.org/ and llms-full.txt convention (e.g. OpenAI, Loops).
 */

function stripMdxToMarkdown(source: string): string {
	return (
		source
			// Self-closing JSX/MDX
			.replace(/<[A-Za-z][^/>]*\/\s*>/g, '')
			// Block components: keep inner content (e.g. <Callout>...</Callout>)
			.replace(/<[A-Za-z][^>]*>([\s\S]*?)<\/[A-Za-z][^>]*>/g, '$1')
			// Inline or remaining tags
			.replace(/<[^>]+>/g, '')
			.trim()
	);
}

export async function GET() {
	const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

	try {
		const llmsPath = path.join(process.cwd(), 'public', 'llms.txt');
		const baseContent = fs.readFileSync(llmsPath, 'utf8');

		const docs = await getAllDocsMeta();
		const docParts: string[] = [];

		for (const meta of docs) {
			const { frontmatter, source, href } = await loadDocBySlug(meta.slug);
			const body = stripMdxToMarkdown(source);
			docParts.push(
				`\n\n# ${frontmatter.title}\n` +
					`URL: ${base}${href}\n` +
					`Section: ${frontmatter.section}\n` +
					`\n${frontmatter.description}\n\n---\n\n${body}`
			);
		}

		const fullContent =
			baseContent +
			'\n\n# Full documentation (included for LLM context)\n\n' +
			'The following sections contain the full text of the product documentation.\n' +
			docParts.join('\n');

		return new NextResponse(fullContent, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
			},
		});
	} catch (e) {
		console.error('llms-full.txt generation error:', e);
		return new NextResponse('Error generating llms-full.txt', { status: 500 });
	}
}
