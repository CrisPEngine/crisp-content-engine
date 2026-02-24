import type { MetadataRoute } from 'next';

import { getAllDocsMeta } from '@/lib/docs/content';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
	const now = new Date();

	const docs = await getAllDocsMeta();

	const staticUrls: MetadataRoute.Sitemap = [
		{ url: `${base}/`, lastModified: now },
		{ url: `${base}/docs`, lastModified: now },
		{ url: `${base}/llms.txt`, lastModified: now },
		{ url: `${base}/.well-known/llms.txt`, lastModified: now },
		{ url: `${base}/llms-full.txt`, lastModified: now },
	];

	const docUrls: MetadataRoute.Sitemap = docs
		.filter((d) => d.href.startsWith('/docs'))
		.map((d) => ({
			url: `${base}${d.href}`,
			lastModified: now,
		}));

	return [...staticUrls, ...docUrls];
}

