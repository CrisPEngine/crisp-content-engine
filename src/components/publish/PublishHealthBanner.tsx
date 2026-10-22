'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

type PublishHealthBannerPayload = {
	severity: 'warning' | 'error';
	title: string;
	details: string[];
};

export function PublishHealthBanner() {
	const [banners, setBanners] = useState<PublishHealthBannerPayload[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/publish/health', { cache: 'no-store', credentials: 'include' });
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled && Array.isArray(data.banners) && data.banners.length > 0) {
					setBanners(data.banners);
				}
			} catch {
				// Non-blocking banner
			} finally {
				if (!cancelled) setLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (!loaded || banners.length === 0) return null;

	return (
		<div className="mx-auto max-w-6xl px-4 pb-4 space-y-3">
			{banners.map((banner, index) => (
				<div
					key={`${banner.title}-${index}`}
					className={`rounded-xl2 border px-4 py-3 ${
						banner.severity === 'error'
							? 'border-danger/40 bg-danger/10 text-text'
							: 'border-amber-500/40 bg-amber-500/10 text-text'
					}`}
					role="status"
				>
					<div className="flex gap-2 items-start">
						<AlertTriangle
							className={`w-5 h-5 shrink-0 mt-0.5 ${banner.severity === 'error' ? 'text-danger' : 'text-amber-600'}`}
						/>
						<div className="space-y-1">
							<p className="font-semibold text-sm">{banner.title}</p>
							{banner.details.map((line) => (
								<p key={line} className="text-sm text-text-dim">
									{line}
								</p>
							))}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
