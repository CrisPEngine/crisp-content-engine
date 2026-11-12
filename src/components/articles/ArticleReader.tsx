'use client';

import { parseCanonicalBlocks, type CanonicalBlock, type CanonicalInline } from '@/lib/articles/canonical';

function Inline({ nodes }: { nodes: CanonicalInline[] }) {
	return (
		<>
			{nodes.map((node, index) => {
				if (node.type === 'break') return <br key={index} />;
				if (node.type === 'image') return <img key={index} src={node.url} alt={node.alt} className="my-4 max-w-full rounded-lg" />;
				if (node.type === 'link') {
					return (
						<a key={index} href={node.url} className="underline text-primary" target={node.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
							<Inline nodes={node.children} />
						</a>
					);
				}
				const className = [
					node.marks.includes('bold') ? 'font-semibold' : '',
					node.marks.includes('italic') ? 'italic' : '',
					node.marks.includes('strike') ? 'line-through' : '',
					node.marks.includes('code') ? 'font-mono text-[0.92em]' : '',
				].filter(Boolean).join(' ');
				return <span key={index} className={className || undefined}>{node.value}</span>;
			})}
		</>
	);
}

function textOf(nodes: CanonicalInline[]): string {
	return nodes.map((node) => (node.type === 'text' ? node.value : node.type === 'link' ? textOf(node.children) : '')).join('');
}

function marked(value: string, anchor: string | null, highlights: string[]): boolean {
	if (anchor && value.includes(anchor)) return true;
	return highlights.some((snippet) => snippet.length > 16 && value.includes(snippet.slice(0, 40)));
}

function Blocks({ blocks, anchor, highlights }: { blocks: CanonicalBlock[]; anchor: string | null; highlights: string[] }) {
	return (
		<>
			{blocks.map((block, index) => {
				if (block.type === 'heading') {
					const text = textOf(block.children);
					const Tag = block.level <= 2 ? 'h2' : 'h3';
					return (
						<Tag key={index} id={`section-${index}`} className={`font-semibold tracking-tight ${block.level <= 2 ? 'mt-10 text-2xl' : 'mt-6 text-xl'} ${marked(text, anchor, highlights) ? 'rounded bg-accent/20 px-2' : ''}`}>
							<Inline nodes={block.children} />
						</Tag>
					);
				}
				if (block.type === 'paragraph') {
					return (
						<p key={index} id={marked(textOf(block.children), anchor, highlights) ? `change-${index}` : undefined} className={`mt-4 text-[1.05rem] leading-8 ${marked(textOf(block.children), anchor, highlights) ? 'rounded bg-accent/20 px-2' : ''}`}>
							<Inline nodes={block.children} />
						</p>
					);
				}
				if (block.type === 'list') {
					const List = block.ordered ? 'ol' : 'ul';
					return (
						<List key={index} className={`mt-4 space-y-2 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
							{block.items.map((item, itemIndex) => (
								<li key={itemIndex} className="leading-7"><Blocks blocks={item} anchor={anchor} highlights={highlights} /></li>
							))}
						</List>
					);
				}
				if (block.type === 'quote') {
					return <blockquote key={index} className="mt-4 border-l-2 border-primary/50 pl-4 text-text-soft"><Blocks blocks={block.children} anchor={anchor} highlights={highlights} /></blockquote>;
				}
				if (block.type === 'table') {
					return (
						<div key={index} className="mt-6 overflow-x-auto">
							<table className="w-full border-collapse text-sm">
								<thead>
									<tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} className="border border-edge px-3 py-2 text-left"><Inline nodes={cell} /></th>)}</tr>
								</thead>
								<tbody>
									{block.rows.map((row, rowIndex) => (
										<tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-edge px-3 py-2 align-top"><Inline nodes={cell} /></td>)}</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				}
				if (block.type === 'code') return <pre key={index} className="mt-4 overflow-x-auto rounded-lg bg-bg p-4 text-sm"><code>{block.value}</code></pre>;
				if (block.type === 'rule') return <hr key={index} className="my-8 border-edge" />;
				return null;
			})}
		</>
	);
}

export function ArticleReader({ title, body, anchor, highlights = [] }: { title: string; body: string; anchor?: string | null; highlights?: string[] }) {
	const blocks = body.trim() ? parseCanonicalBlocks(body) : [];
	return (
		<article className="mx-auto max-w-3xl px-2 py-4 text-text">
			<h1 className="text-4xl font-semibold leading-tight tracking-tight">{title}</h1>
			{blocks.length ? <Blocks blocks={blocks} anchor={anchor ?? null} highlights={highlights} /> : <p className="mt-6 text-text-soft">This article has no draft yet.</p>}
		</article>
	);
}
