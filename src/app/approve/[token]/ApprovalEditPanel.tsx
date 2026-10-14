'use client';

import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { containsForbiddenDash } from '@/lib/content/dashSanitizer';

const pressableButton =
	'touch-manipulation select-none transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-60';

type SaveAction = (formData: FormData) => void | Promise<void>;

function CharCount({ value, limit }: { value: string; limit: number | null }) {
	if (limit == null) return <span className="text-xs text-text-soft">{value.length} characters</span>;
	const over = value.length > limit;
	return (
		<span className={`text-xs ${over ? 'font-medium text-amber-400' : 'text-text-soft'}`}>
			{value.length} / {limit}
		</span>
	);
}

function SaveFieldset({ dashHint }: { dashHint: boolean }) {
	const { pending } = useFormStatus();
	return (
		<fieldset disabled={pending} className="grid gap-3 border-0 p-0 m-0">
			{dashHint ? (
				<p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
					Em dashes are not allowed. They will be replaced when you save.
				</p>
			) : null}
			<button
				type="submit"
				className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl2 border border-edge/60 bg-surface/50 px-4 hover:bg-surface/70 ${pressableButton}`}
			>
				{pending ? (
					<>
						<Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
						<span>Saving…</span>
					</>
				) : (
					<span>Save changes</span>
				)}
			</button>
		</fieldset>
	);
}

export function ApprovalEditPanel({
	saveAction,
	tokenField,
	initialBody,
	initialTitle,
	initialCta,
	initialPublishAtGst,
	showTitle,
	showCta,
	showSchedule,
	bodyCharLimit,
	titleCharLimit,
	savedMessage,
}: {
	saveAction: SaveAction;
	tokenField: { name: string; value: string };
	initialBody: string;
	initialTitle: string;
	initialCta: string;
	initialPublishAtGst: string;
	showTitle: boolean;
	showCta: boolean;
	showSchedule: boolean;
	bodyCharLimit: number | null;
	titleCharLimit: number | null;
	savedMessage?: string | null;
}) {
	const [body, setBody] = useState(initialBody);
	const [title, setTitle] = useState(initialTitle);
	const [cta, setCta] = useState(initialCta);
	const [publishAtGst, setPublishAtGst] = useState(initialPublishAtGst);

	const dashHint = useMemo(
		() => containsForbiddenDash(body) || containsForbiddenDash(title) || containsForbiddenDash(cta),
		[body, title, cta],
	);

	return (
		<section className="card space-y-4 p-4" aria-label="Edit before approving">
			<div>
				<h2 className="text-sm font-medium text-text">Edit before approving</h2>
				<p className="mt-1 text-xs text-text-soft">Changes are saved to this draft. Channel limits apply.</p>
			</div>
			{savedMessage ? (
				<p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-text" role="status">
					{savedMessage}
				</p>
			) : null}
			<form action={saveAction} className="grid gap-4">
				<input type="hidden" name={tokenField.name} value={tokenField.value} />
				{showTitle ? (
					<label className="grid gap-1 text-sm">
						<span className="font-medium text-text">Title / hook</span>
						<input
							name="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="rounded-xl2 border border-edge/60 bg-bg px-3 py-2"
							maxLength={titleCharLimit ?? undefined}
						/>
						<CharCount value={title} limit={titleCharLimit} />
					</label>
				) : null}
				<label className="grid gap-1 text-sm">
					<span className="font-medium text-text">{showTitle ? 'Post body' : 'Content'}</span>
					<textarea
						name="body"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						rows={10}
						className="min-h-[8rem] w-full rounded-xl2 border border-edge/60 bg-bg px-3 py-2 leading-relaxed"
					/>
					<CharCount value={body} limit={bodyCharLimit} />
				</label>
				{showCta ? (
					<label className="grid gap-1 text-sm">
						<span className="font-medium text-text">CTA</span>
						<input
							name="cta"
							value={cta}
							onChange={(e) => setCta(e.target.value)}
							className="rounded-xl2 border border-edge/60 bg-bg px-3 py-2"
						/>
					</label>
				) : null}
				{showSchedule ? (
					<label className="grid gap-1 text-sm">
						<span className="font-medium text-text">Scheduled publish (GST, Asia/Dubai)</span>
						<input
							type="datetime-local"
							name="publishAtLocalGst"
							value={publishAtGst}
							onChange={(e) => setPublishAtGst(e.target.value)}
							className="rounded-xl2 border border-edge/60 bg-bg px-3 py-2"
						/>
						<span className="text-xs text-text-soft">Stored in UTC when saved.</span>
					</label>
				) : null}
				<SaveFieldset dashHint={dashHint} />
			</form>
		</section>
	);
}
