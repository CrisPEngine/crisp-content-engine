'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

function getLanguageLabel(className?: string) {
	if (!className) return '';
	const m = className.match(/language-([a-z0-9-]+)/i);
	return (m?.[1] || '').toUpperCase();
}

export function CodeBlock({
	code,
	className,
}: {
	code: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	const lang = useMemo(() => getLanguageLabel(className), [className]);

	return (
		<div className="my-6 overflow-hidden rounded-xl2 border border-edge/60 bg-surface/40">
			<div className="flex items-center justify-between gap-3 border-b border-edge/60 px-3 py-2">
				<div className="text-[11px] font-semibold tracking-wide text-text-dim">
					{lang ? lang : 'CODE'}
				</div>
				<button
					type="button"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(code);
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1200);
						} catch {
							// ignore
						}
					}}
					className="inline-flex items-center gap-1.5 rounded-md border border-edge/60 bg-surface/30 px-2 py-1 text-[11px] font-semibold text-text-soft hover:bg-surface/50"
					aria-label="Copy code"
				>
					{copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-text-soft">
				<code>{code}</code>
			</pre>
		</div>
	);
}

