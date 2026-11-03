'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, ExternalLink, Loader2, Save, X } from 'lucide-react';
import {
	assertGstDatetimeLocalFieldValue,
	formatPublishAtForDisplay,
	gstDatetimeLocalValueToUtcIso,
	publishScheduleLeadTimeMessage,
	schedulePublishMaxDatetimeLocal,
	schedulePublishMinDatetimeLocal,
	utcIsoToGstDatetimeLocalValue,
} from '@/lib/datetime/gstSchedule';
import {
	canEditScheduleItemText,
	canRescheduleScheduleItem,
	canUnscheduleScheduleItem,
	platformColor,
	statusBadgeClass,
	type ScheduleCalendarItem,
} from '@/lib/schedule/schedulePresentation';

type Props = {
	item: ScheduleCalendarItem | null;
	open: boolean;
	onClose: () => void;
	onReschedule: (contentId: string, newDate: string) => Promise<boolean>;
	onUnschedule: (contentId: string) => Promise<boolean>;
	onContentUpdated?: (contentId: string, next: { content: string; title?: string }) => void;
};

export function ScheduleItemDetailSheet({
	item,
	open,
	onClose,
	onReschedule,
	onUnschedule,
	onContentUpdated,
}: Props) {
	const [rescheduleDraft, setRescheduleDraft] = useState('');
	const [showReschedule, setShowReschedule] = useState(false);
	const [editText, setEditText] = useState(false);
	const [draftBody, setDraftBody] = useState('');
	const [busy, setBusy] = useState<'reschedule' | 'unschedule' | 'save' | null>(null);
	const [localError, setLocalError] = useState<string | null>(null);

	useEffect(() => {
		if (!item) return;
		setRescheduleDraft(utcIsoToGstDatetimeLocalValue(item.scheduled_date));
		setDraftBody(item.content || item.content_preview || '');
		setShowReschedule(false);
		setEditText(false);
		setLocalError(null);
	}, [item]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !busy) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, busy, onClose]);

	if (!open || !item) return null;

	const colors = platformColor(item.platform);
	const bodyText = item.content || item.content_preview || '';
	const editable = canEditScheduleItemText(item.status);
	const rescheduleAllowed = canRescheduleScheduleItem(item.status);
	const unscheduleAllowed = canUnscheduleScheduleItem(item.status);

	async function saveReschedule() {
		setBusy('reschedule');
		setLocalError(null);
		try {
			const iso = gstDatetimeLocalValueToUtcIso(rescheduleDraft);
			const ok = await onReschedule(item!.id, iso);
			if (ok) {
				setShowReschedule(false);
				onClose();
			}
		} catch (err: unknown) {
			setLocalError(err instanceof Error ? err.message : 'Failed to reschedule');
		} finally {
			setBusy(null);
		}
	}

	async function runUnschedule() {
		setBusy('unschedule');
		setLocalError(null);
		const ok = await onUnschedule(item!.id);
		setBusy(null);
		if (ok) onClose();
	}

	async function saveText() {
		setBusy('save');
		setLocalError(null);
		try {
			const res = await fetch('/api/content/native-queue', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ contentId: item!.id, content: draftBody }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to save text');
			}
			onContentUpdated?.(item!.id, { content: draftBody });
			setEditText(false);
		} catch (err: unknown) {
			setLocalError(err instanceof Error ? err.message : 'Failed to save text');
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
			<button
				type="button"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				aria-label="Close"
				onClick={() => !busy && onClose()}
			/>
			<div
				role="dialog"
				aria-modal="true"
				className="relative z-10 w-full max-w-lg max-h-[min(92vh,720px)] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-edge/60 bg-surface/95 shadow-2xl pb-[env(safe-area-inset-bottom)]"
			>
				<div className="sticky top-0 flex items-start justify-between gap-3 p-4 border-b border-edge/60 bg-surface/95 backdrop-blur-xs">
					<div className="min-w-0 flex-1">
						<h2 className="text-lg font-semibold text-text leading-snug break-words">{item.title}</h2>
						<p className="text-xs text-text-dim mt-1">{item.brand_name}</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={Boolean(busy)}
						className="shrink-0 p-2 rounded-lg hover:bg-surface/60 text-text-dim"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="p-4 space-y-4">
					<div className="flex flex-wrap gap-2">
						<span
							className="px-2.5 py-1 rounded-full text-xs font-medium border"
							style={{
								backgroundColor: colors.bg,
								borderColor: colors.border,
								color: colors.text,
							}}
						>
							{item.platform}
						</span>
						<span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadgeClass(item.status)}`}>
							{item.status}
						</span>
					</div>

					<div className="flex items-start gap-2 text-sm text-text-soft">
						<Calendar className="w-4 h-4 text-text-dim shrink-0 mt-0.5" />
						<span>{formatPublishAtForDisplay(item.scheduled_date)}</span>
					</div>

					{item.image_reference_url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={item.image_reference_url}
							alt=""
							className="w-full max-h-48 object-cover rounded-xl2 border border-edge/60"
						/>
					) : null}

					{editText ? (
						<div className="space-y-2">
							<label className="text-sm font-medium text-text">Post text</label>
							<textarea
								value={draftBody}
								onChange={(e) => setDraftBody(e.target.value)}
								rows={6}
								className="w-full px-3 py-2 text-sm rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
							/>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => saveText()}
									disabled={busy === 'save'}
									className="px-3 py-2 rounded-xl2 bg-primary/10 hover:bg-primary/20 text-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
								>
									{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
									Save text
								</button>
								<button
									type="button"
									onClick={() => {
										setDraftBody(bodyText);
										setEditText(false);
									}}
									className="px-3 py-2 rounded-xl2 border border-edge/60 text-text-dim text-sm"
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<p className="text-sm text-text-soft whitespace-pre-wrap break-words">{bodyText}</p>
					)}

					{item.last_publish_error ? (
						<p className="text-xs text-danger">{item.last_publish_error}</p>
					) : null}

					{item.external_url ? (
						<a
							href={item.external_url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
						>
							View published post
							<ExternalLink className="w-3.5 h-3.5" />
						</a>
					) : null}

					{localError ? (
						<p className="text-sm text-danger">{localError}</p>
					) : null}

					{showReschedule ? (
						<div className="card p-3 space-y-2">
							<p className="text-sm font-medium text-text">New publish time (GST)</p>
							<p className="text-xs text-text-dim">{publishScheduleLeadTimeMessage()}</p>
							<input
								type="datetime-local"
								value={assertGstDatetimeLocalFieldValue(rescheduleDraft)}
								onChange={(e) => setRescheduleDraft(e.target.value)}
								min={schedulePublishMinDatetimeLocal()}
								max={schedulePublishMaxDatetimeLocal()}
								className="w-full px-3 py-2.5 text-sm rounded-xl2 border border-edge/60 bg-bg/80 text-text"
							/>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => saveReschedule()}
									disabled={busy === 'reschedule'}
									className="px-3 py-2.5 min-h-[44px] rounded-xl2 bg-primary/10 hover:bg-primary/20 text-primary text-sm disabled:opacity-50"
								>
									{busy === 'reschedule' ? 'Saving…' : 'Save time'}
								</button>
								<button
									type="button"
									onClick={() => setShowReschedule(false)}
									className="px-3 py-2.5 min-h-[44px] rounded-xl2 border border-edge/60 text-text-dim text-sm"
								>
									Cancel
								</button>
							</div>
						</div>
					) : null}
				</div>

				<div className="sticky bottom-0 p-4 border-t border-edge/60 bg-surface/95 flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
					{rescheduleAllowed && !showReschedule ? (
						<button
							type="button"
							onClick={() => setShowReschedule(true)}
							className="w-full px-4 py-3 min-h-[44px] rounded-xl2 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium"
						>
							Reschedule
						</button>
					) : null}
					{unscheduleAllowed ? (
						<button
							type="button"
							onClick={() => runUnschedule()}
							disabled={busy === 'unschedule'}
							className="w-full px-4 py-3 min-h-[44px] rounded-xl2 border border-edge/60 text-text-soft text-sm font-medium hover:bg-surface/50 disabled:opacity-50"
						>
							{busy === 'unschedule' ? 'Removing…' : 'Unschedule'}
						</button>
					) : null}
					{editable && !editText ? (
						<button
							type="button"
							onClick={() => setEditText(true)}
							className="w-full px-4 py-3 min-h-[44px] rounded-xl2 border border-edge/60 text-text text-sm font-medium hover:bg-surface/50"
						>
							Edit text
						</button>
					) : null}
					{item.status === 'Needs Approval' && item.brand_profile_id ? (
						<Link
							href={`/content/approval?brand_profile_id=${encodeURIComponent(item.brand_profile_id)}`}
							className="w-full px-4 py-3 min-h-[44px] rounded-xl2 border border-primary/30 bg-primary/5 text-primary text-sm font-medium text-center"
						>
							Open approval queue
						</Link>
					) : null}
				</div>
			</div>
		</div>
	);
}
