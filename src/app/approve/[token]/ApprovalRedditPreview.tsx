import type { RedditPostFields } from '@/lib/channels/reddit';
import { redditSubmitUrl } from '@/lib/channels/reddit';
import { ApprovalCopyButton } from './ApprovalCopyButton';

export function ApprovalRedditPreview({ reddit }: { reddit: RedditPostFields }) {
	const submitHref = redditSubmitUrl(reddit.subreddit, reddit.title);

	return (
		<section className="card space-y-3 p-4 text-sm">
			<p className="font-medium text-text">Reddit post</p>
			<p className="text-text-soft">
				Target: <span className="font-medium text-text">r/{reddit.subreddit}</span>
				{reddit.flairText ? (
					<>
						{' '}
						· Flair: <span className="text-text">{reddit.flairText}</span>
					</>
				) : null}
			</p>
			<div className="space-y-1">
				<p className="text-xs uppercase tracking-wide text-text-soft">Title</p>
				<p className="text-base font-semibold leading-snug">{reddit.title || '—'}</p>
				<ApprovalCopyButton label="Copy title" text={reddit.title} />
			</div>
			<div className="space-y-1">
				<p className="text-xs uppercase tracking-wide text-text-soft">Body</p>
				<pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface/30 p-3 text-sm leading-relaxed">
					{reddit.body || (reddit.linkUrl ? `(Link post) ${reddit.linkUrl}` : '—')}
				</pre>
				<ApprovalCopyButton label="Copy body" text={reddit.body || reddit.linkUrl || ''} />
			</div>
			{reddit.linkUrl ? (
				<p className="text-text-soft">
					Link URL:{' '}
					<a className="text-primary underline" href={reddit.linkUrl} target="_blank" rel="noreferrer">
						{reddit.linkUrl}
					</a>
				</p>
			) : null}
			<p>
				<a className="text-primary underline" href={submitHref} target="_blank" rel="noreferrer">
					Open submit page
				</a>
			</p>
		</section>
	);
}
