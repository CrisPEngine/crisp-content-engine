import type { Metadata } from 'next';

import { DocsHeader } from '@/components/docs/DocsHeader';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { getDocsNav, getDocsSearchIndex } from '@/lib/docs/content';

export const dynamic = 'force-static';

export const metadata: Metadata = {
	title: 'Docs | CRISP Content Engine',
	description:
		'Documentation hub for CRISP Content Engine — generate, approve, publish, and learn.',
	alternates: {
		canonical: '/docs',
	},
};

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
	const nav = await getDocsNav();
	const searchIndex = await getDocsSearchIndex();

	return (
		// Full-bleed container (escapes RootLayout max width)
		<div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
			<div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
				<DocsHeader nav={nav} searchIndex={searchIndex} />

				<div className="grid grid-cols-12 gap-8 py-8">
					<aside className="hidden lg:block lg:col-span-3">
						<DocsSidebar nav={nav} />
					</aside>
					<div className="col-span-12 lg:col-span-9">{children}</div>
				</div>
			</div>
		</div>
	);
}

