'use client';

import { X as XIcon, Loader2 } from 'lucide-react';

export type ItemDetailData = {
	id: string;
	channel: string;
	post_title: string;
	body_draft: string;
	hashtags: string;
	image_prompt: string;
	status: string;
	_editing?: boolean;
	_editDraft?: {
		post_title: string;
		body_draft: string;
		hashtags: string;
		image_prompt: string;
	};
	_saving?: boolean;
};

type ItemDetailModalProps = {
	item: ItemDetailData;
	onClose: () => void;
	onEdit?: () => void;
	onCancelEdit?: () => void;
	onUpdateDraft?: (field: keyof NonNullable<ItemDetailData['_editDraft']>, value: string) => void;
	onSaveEdit?: () => void;
};

export function ItemDetailModal({
	item,
	onClose,
	onEdit,
	onCancelEdit,
	onUpdateDraft,
	onSaveEdit,
}: ItemDetailModalProps) {
	const isBlog = item.channel.toLowerCase() === 'blog';
	const editing = item._editing && item._editDraft;
	const draft = editing ? item._editDraft! : {
		post_title: item.post_title || '',
		body_draft: item.body_draft || '',
		hashtags: item.hashtags || '',
		image_prompt: item.image_prompt || '',
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
			onClick={onClose}
		>
			<div
				className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-edge/60 bg-bg shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="sticky top-0 flex items-center justify-between gap-3 border-b border-edge/60 bg-bg/95 px-5 py-4 backdrop-blur">
					<div>
						<p className="text-xs text-text-dim uppercase tracking-wide">{item.channel}</p>
						<h2 className="text-lg font-semibold text-text">
							{draft.post_title || 'Untitled draft'}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-surface/50 text-text-dim"
						aria-label="Close"
					>
						<XIcon className="w-5 h-5" />
					</button>
				</div>

				<div className="p-5 space-y-4">
					{editing ? (
						<>
							<input
								type="text"
								value={draft.post_title}
								onChange={(e) => onUpdateDraft?.('post_title', e.target.value)}
								placeholder="Title / hook"
								className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm focus:border-primary/60 focus:outline-none"
							/>
							<textarea
								value={draft.body_draft}
								onChange={(e) => onUpdateDraft?.('body_draft', e.target.value)}
								rows={isBlog ? 18 : 10}
								placeholder="Post body…"
								className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm resize-none focus:border-primary/60 focus:outline-none"
							/>
							<input
								type="text"
								value={draft.hashtags}
								onChange={(e) => onUpdateDraft?.('hashtags', e.target.value)}
								placeholder="Hashtags"
								className="w-full px-3 py-2 rounded-lg border border-edge/60 bg-bg/80 text-text text-sm focus:border-primary/60 focus:outline-none"
							/>
							<div className="flex gap-2 justify-end">
								<button
									type="button"
									onClick={onCancelEdit}
									className="px-4 py-2 rounded-lg border border-edge/60 text-text-soft text-sm"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={onSaveEdit}
									disabled={item._saving}
									className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-medium disabled:opacity-50"
								>
									{item._saving ? (
										<span className="inline-flex items-center gap-2">
											<Loader2 className="w-4 h-4 animate-spin" /> Saving…
										</span>
									) : (
										'Save changes'
									)}
								</button>
							</div>
						</>
					) : isBlog ? (
						<article className="prose prose-invert max-w-none">
							{draft.post_title && (
								<h1 className="text-2xl font-bold text-text mb-4">{draft.post_title}</h1>
							)}
							<div className="text-text-soft whitespace-pre-wrap leading-relaxed text-base">
								{draft.body_draft}
							</div>
							{draft.hashtags && (
								<p className="text-primary/80 text-sm mt-6 not-prose">{draft.hashtags}</p>
							)}
						</article>
					) : (
						<div className="space-y-3">
							{draft.post_title && (
								<p className="font-medium text-text">{draft.post_title}</p>
							)}
							<p className="text-text-soft whitespace-pre-wrap leading-relaxed">
								{draft.body_draft}
							</p>
							{draft.hashtags && (
								<p className="text-primary/80 text-sm">{draft.hashtags}</p>
							)}
						</div>
					)}

					{!editing && onEdit && (
						<div className="pt-2 border-t border-edge/40">
							<button
								type="button"
								onClick={onEdit}
								className="text-sm text-primary hover:underline"
							>
								Edit draft
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
