'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { intelligenceStrategyHref } from '@/lib/brands/workingBrand';

type Row = {
	brandBrainId: string;
	airtableBrandId: string;
	brandName: string;
	nativePhase: string;
	completenessScore: number;
	complete: boolean;
	isSkeleton: boolean;
};

export function NativeMigrationPanel() {
	const [rows, setRows] = useState<Row[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	async function load() {
		const res = await fetch('/api/admin/native-migration', { cache: 'no-store' });
		if (!res.ok) {
			setError('Could not load native migration status.');
			return;
		}
		const body = (await res.json()) as { brands?: Row[] };
		setRows(body.brands ?? []);
	}

	useEffect(() => {
		void load();
	}, []);

	async function regenerate(airtableBrandId: string) {
		setBusyId(airtableBrandId);
		setError(null);
		const res = await fetch('/api/admin/native-migration', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ airtableBrandId, escalate: true, runWebsiteResearch: true }),
		});
		if (!res.ok) {
			const body = (await res.json()) as { error?: string };
			setError(body.error ?? 'Regeneration failed.');
		} else {
			await load();
		}
		setBusyId(null);
	}

	return (
		<div className="card p-4 space-y-3">
			<h2 className="font-semibold">Native strategy migration</h2>
			<p className="text-sm text-text-dim">
				Import Make/Airtable strategy as a snapshot, run website research when available, and enqueue full native regeneration. Safe to run twice.
			</p>
			{error ? <p className="text-sm text-warning">{error}</p> : null}
			<ul className="space-y-2 text-sm">
				{rows.map((row) => (
					<li key={row.brandBrainId} className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/40 pb-2">
						<div>
							<div className="font-medium">{row.brandName}</div>
							<div className="text-text-dim text-xs">
								Phase {row.nativePhase} · score {row.completenessScore}
								{row.isSkeleton ? ' · skeleton' : ''}
								{row.complete ? ' · complete' : ''}
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Link href={intelligenceStrategyHref(row.airtableBrandId)} className="text-text-soft underline text-xs">
								Open Intelligence strategy
							</Link>
							<button
								type="button"
								className="text-primary underline disabled:opacity-50"
								disabled={busyId === row.airtableBrandId}
								onClick={() => void regenerate(row.airtableBrandId)}
							>
								{busyId === row.airtableBrandId ? 'Enqueueing…' : 'Regenerate native strategy'}
							</button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
