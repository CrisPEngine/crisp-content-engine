'use client';

import { useState } from 'react';

export function ApprovalCopyButton({ label, text }: { label: string; text: string }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button type="button" className="btn-secondary text-sm" onClick={() => void copy()} disabled={!text.trim()}>
			{copied ? 'Copied' : label}
		</button>
	);
}
