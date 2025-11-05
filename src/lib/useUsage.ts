"use client";

import { useEffect, useState } from 'react';

type Summary = {
	ok: boolean;
	reason?: string;
	usage?: { posts: number };
	caps?: { posts_per_month: number };
};

export function useUsage() {
	const [data, setData] = useState<Summary | null>(null);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		(async () => {
			setLoading(true);
			const r = await fetch('/api/usage/summary', { cache: 'no-store' });
			const j = await r.json();
			setData(j);
			setLoading(false);
		})();
	}, []);
	return { data, loading };
}


