'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AdaptiveWorkspaceLayout } from '@/components/command/AdaptiveWorkspaceLayout';
import { STAGE_TONE_LABEL, WORKSPACE_STAGES, type StageTone, type WorkspaceStageId } from '@/lib/articles/workspaceNavigation';

const TONE_CLASS: Record<StageTone, string> = {
	complete: 'bg-accent',
	attention: 'bg-warning',
	pending: 'bg-text-dim',
};

function stageStatus(id: WorkspaceStageId, tone: StageTone, editorialAttention: boolean) {
	if (id === 'review' && editorialAttention) return 'Needs attention';
	return STAGE_TONE_LABEL[tone];
}

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
	primaryBusyLabel,
	contextOpen,
	onToggleContext,
	context,
	editorialAttention = false,
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
	primaryBusyLabel?: string;
	contextOpen: boolean;
	onToggleContext: () => void;
	context: ReactNode;
	editorialAttention?: boolean;
	children: ReactNode;
}) {
	const [stagesOpen, setStagesOpen] = useState(false);

	useEffect(() => {
		setStagesOpen(localStorage.getItem('crisp-stage-panel') === 'open');
	}, []);

	function toggleStages() {
		setStagesOpen((open) => {
			const next = !open;
			localStorage.setItem('crisp-stage-panel', next ? 'open' : 'closed');
			return next;
		});
	}

	const stages = (
		<nav className="p-3" aria-label="Workflow stages">
			<ol className="space-y-1">
				{WORKSPACE_STAGES.map((item) => {
					const status = stageStatus(item.id, tones[item.id], editorialAttention);
					return (
						<li key={item.id}>
							<button
								type="button"
								className={`flex w-full min-w-0 flex-col items-start gap-1 rounded-lg px-3 py-2 text-left text-sm ${item.id === stage ? 'bg-primary/15 font-medium ring-1 ring-primary/40' : 'hover:bg-surface-hover'}`}
								aria-current={item.id === stage ? 'page' : undefined}
								onClick={() => onStage(item.id)}
							>
								<span className="flex w-full items-center gap-2">
									<span className={`h-2 w-2 shrink-0 rounded-full ${item.id === 'review' && editorialAttention ? TONE_CLASS.attention : TONE_CLASS[tones[item.id]]}`} aria-hidden />
									<span className="min-w-0 flex-1">{item.label}</span>
								</span>
								<span className="pl-4 text-xs text-text-soft">{status}</span>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);

	return (
		<div className="flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-col">
			<header className="space-y-3 border-b border-edge px-4 py-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<h1 className="break-words text-xl font-semibold md:text-2xl">{title}</h1>
						<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-soft">{meta}</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button className="btn" type="button" onClick={toggleStages} aria-expanded={stagesOpen}>{stagesOpen ? 'Hide stages' : 'Stage details'}</button>
						<button className="btn" type="button" onClick={onToggleContext} aria-expanded={contextOpen}>{contextOpen ? 'Hide recommendations' : 'Recommendations'}</button>
						<button className="btn-primary whitespace-normal" type="button" disabled={primaryDisabled || primaryBusy} aria-busy={primaryBusy || undefined} onClick={onPrimary}>
							{primaryBusy ? (primaryBusyLabel || 'Working…') : primaryLabel}
						</button>
					</div>
				</div>
				<div className="flex flex-wrap gap-2" aria-label="Workflow">
					{WORKSPACE_STAGES.map((item) => {
						const status = stageStatus(item.id, tones[item.id], editorialAttention);
						return (
							<button
								key={item.id}
								type="button"
								className={`flex min-w-[7.5rem] max-w-full flex-1 flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left text-sm ${item.id === stage ? 'border-primary bg-primary/10' : 'border-edge bg-surface hover:bg-surface-hover'}`}
								aria-current={item.id === stage ? 'step' : undefined}
								onClick={() => onStage(item.id)}
							>
								<span className="text-sm font-medium">{item.label}</span>
								<span className="text-xs leading-snug text-text-soft">{status}</span>
							</button>
						);
					})}
				</div>
			</header>
			<AdaptiveWorkspaceLayout
				leftOpen={stagesOpen}
				rightOpen={contextOpen}
				left={stages}
				right={<aside className="min-w-0 overflow-auto p-4" aria-label="Stage tools">{context}</aside>}
			>
				<main className="min-w-0 overflow-auto px-4 py-4 lg:px-8">{children}</main>
			</AdaptiveWorkspaceLayout>
		</div>
	);
}
