'use client';

import type { ReactNode } from 'react';
import { STAGE_TONE_LABEL, WORKSPACE_STAGES, type StageTone, type WorkspaceStageId } from '@/lib/articles/workspaceNavigation';

const TONE_CLASS: Record<StageTone, string> = {
	complete: 'bg-accent',
	attention: 'bg-warning',
	pending: 'bg-text-dim',
};

export function WorkspaceFrame({
	stage,
	onStage,
	tones,
	title,
	meta,
	primaryLabel,
	onPrimary,
	primaryDisabled,
	primaryBusy,
	contextOpen,
	onToggleContext,
	context,
	children,
}: {
	stage: WorkspaceStageId;
	onStage: (stage: WorkspaceStageId) => void;
	tones: Record<WorkspaceStageId, StageTone>;
	title: string;
	meta: ReactNode;
	primaryLabel: string;
	onPrimary: () => void;
	primaryDisabled?: boolean;
	primaryBusy?: boolean;
	contextOpen: boolean;
	onToggleContext: () => void;
	context: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col">
			<header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
				<div className="min-w-0">
					<h1 className="truncate text-xl font-semibold">{title}</h1>
					<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-soft">{meta}</div>
				</div>
				<div className="flex items-center gap-2">
					<button className="btn" type="button" onClick={onToggleContext} aria-expanded={contextOpen}>
						{contextOpen ? 'Hide tools' : 'Show tools'}
					</button>
					<button className="btn border-primary bg-primary/15" type="button" disabled={primaryDisabled || primaryBusy} aria-busy={primaryBusy || undefined} onClick={onPrimary}>
						{primaryBusy ? 'Working…' : primaryLabel}
					</button>
				</div>
			</header>
			<div className="flex gap-2 overflow-x-auto border-b border-edge px-3 py-2 lg:hidden" aria-label="Workflow">
				{WORKSPACE_STAGES.map((item) => (
					<button key={item.id} type="button" className={`shrink-0 rounded-full border px-3 py-1 text-sm ${item.id === stage ? 'border-primary bg-primary/15' : 'border-edge'}`} aria-current={item.id === stage ? 'page' : undefined} onClick={() => onStage(item.id)}>
						{item.label}
					</button>
				))}
			</div>
			<div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
				<nav className="hidden border-r border-edge p-3 lg:block" aria-label="Workflow">
					<ol className="space-y-1">
						{WORKSPACE_STAGES.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${item.id === stage ? 'bg-primary/15 font-medium' : 'hover:bg-surface'}`}
									aria-current={item.id === stage ? 'page' : undefined}
									onClick={() => onStage(item.id)}
								>
									<span className={`h-2 w-2 rounded-full ${TONE_CLASS[tones[item.id]]}`} aria-hidden />
									<span className="min-w-0 flex-1">{item.label}</span>
									<span className="sr-only">{STAGE_TONE_LABEL[tones[item.id]]}</span>
								</button>
							</li>
						))}
					</ol>
				</nav>
				<main className="min-w-0 overflow-auto px-4 py-4 lg:px-8">{children}</main>
				{contextOpen ? (
					<aside className="min-w-0 overflow-auto border-t border-edge p-4 lg:border-l lg:border-t-0" aria-label="Stage tools">
						{context}
					</aside>
				) : null}
			</div>
		</div>
	);
}
