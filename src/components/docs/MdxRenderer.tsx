import React from 'react';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';

import { Callout } from '@/components/docs/Callout';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { slugifyHeading } from '@/lib/docs/content';

function toPlainText(node: React.ReactNode): string {
	if (typeof node === 'string') return node;
	if (Array.isArray(node)) return node.map(toPlainText).join('');
	if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
		return toPlainText(node.props.children);
	}
	return '';
}

function H2(props: React.HTMLAttributes<HTMLHeadingElement>) {
	const text = toPlainText(props.children);
	const id = slugifyHeading(text);
	return (
		<h2
			{...props}
			id={id}
			className="mt-10 scroll-mt-[170px] text-xl font-semibold tracking-tight text-text"
		/>
	);
}

function H3(props: React.HTMLAttributes<HTMLHeadingElement>) {
	const text = toPlainText(props.children);
	const id = slugifyHeading(text);
	return (
		<h3
			{...props}
			id={id}
			className="mt-8 scroll-mt-[170px] text-lg font-semibold tracking-tight text-text"
		/>
	);
}

function P(props: React.HTMLAttributes<HTMLParagraphElement>) {
	return <p {...props} className="mt-4 leading-relaxed text-text-soft" />;
}

function UL(props: React.HTMLAttributes<HTMLUListElement>) {
	return <ul {...props} className="mt-4 list-disc space-y-2 pl-6 text-text-soft" />;
}

function OL(props: React.HTMLAttributes<HTMLOListElement>) {
	return <ol {...props} className="mt-4 list-decimal space-y-2 pl-6 text-text-soft" />;
}

function LI(props: React.HTMLAttributes<HTMLLIElement>) {
	return <li {...props} className="leading-relaxed" />;
}

function A(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	const { href, ...rest } = props;
	return (
		<a
			{...rest}
			href={href}
			className="text-primary hover:text-text transition underline underline-offset-4"
		/>
	);
}

function InlineCode(props: React.HTMLAttributes<HTMLElement>) {
	return (
		<code
			{...props}
			className="rounded-md border border-edge/60 bg-surface/30 px-1.5 py-0.5 text-[0.85em] text-text"
		/>
	);
}

function Pre(props: any) {
	// MDX compilers typically render: <pre><code className="language-ts">...</code></pre>
	const codeEl = props?.children;
	const className = codeEl?.props?.className as string | undefined;
	const code = (codeEl?.props?.children ?? '').toString().replace(/\n$/, '');
	return <CodeBlock code={code} className={className} />;
}

export async function MdxRenderer({ source }: { source: string }) {
	const { content } = await compileMDX({
		source,
		options: {
			mdxOptions: {
				remarkPlugins: [remarkGfm],
			},
		},
		components: {
			h2: H2,
			h3: H3,
			p: P,
			ul: UL,
			ol: OL,
			li: LI,
			a: A,
			code: InlineCode,
			pre: Pre,
			Callout,
		},
	});

	return <div className="docs-prose">{content}</div>;
}

