'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppHeader() {
	const pathname = usePathname();
	
	// Don't show on login/home page
	if (pathname === '/login' || pathname === '/') {
		return null;
	}

	return (
		<header className="sticky top-0 z-30 backdrop-blur-xs bg-bg/60 border-b border-edge/60 min-h-[90px] flex items-center">
			<div className="mx-auto max-w-5xl px-4 sm:px-6 w-full flex items-center justify-between">
				<Link href="/" className="flex items-center">
					<img 
						src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
						alt="CrisP Content Engine" 
						className="h-20 w-auto"
					/>
				</Link>
				<Link
					href="/dashboard"
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm font-medium text-primary transition"
				>
					Dashboard
				</Link>
			</div>
		</header>
	);
}

