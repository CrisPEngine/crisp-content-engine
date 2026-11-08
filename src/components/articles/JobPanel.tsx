'use client';

import { useEffect, useState } from 'react';

const LOGO_URL = 'https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png';

function elapsed(since: string | null, now: number): string {
	if (!since) return '';
	const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
	const minutes = Math.floor(seconds / 60);
	return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

/**
 * Shows a running background job. The stage text is whatever the job last wrote; there is no
 * percentage because the pipeline does not know how long each model call will take.
 */
export function JobPanel({
	title,
	stage,
	startedAt,
	updatedAt,
	status,
}: {
	title: string;
	stage: string | null;
	startedAt: string | null;
	updatedAt: string | null;
	status: string;
}) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	return (
		<div className="card p-4 flex items-center gap-4" role="status" aria-live="polite">
			<img src={LOGO_URL} alt="" className="h-10 w-auto animate-pulse motion-reduce:animate-none" />
			<div className="space-y-0.5">
				<p className="font-medium">{title}</p>
				<p className="text-sm">{stage || (status === 'queued' ? 'Waiting for a worker' : 'Starting')}</p>
				<p className="text-xs text-text-soft">
					{status === 'queued' ? 'Queued' : 'Running'} {startedAt ? `for ${elapsed(startedAt, now)}` : ''}
					{updatedAt ? ` · last update ${elapsed(updatedAt, now)} ago` : ''}
					{' · '}You can leave this page. The job keeps running and this panel returns when you come back.
				</p>
			</div>
		</div>
	);
}
