import Link from 'next/link';
import { SignOutLink } from '@/components/SignOutLink';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			{/* Marketing header */}
			<header className="sticky top-0 z-30 backdrop-blur-xs bg-bg/60 border-b border-edge/60 min-h-[90px] flex items-center">
				<div className="mx-auto max-w-5xl px-4 sm:px-6 w-full flex items-center justify-between">
					<a href="/" className="flex items-center">
						<img
							src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png"
							alt="CRISP Content Engine"
							className="h-20 w-auto"
							loading="eager"
							width={1200}
							height={627}
						/>
					</a>
					<nav className="flex items-center gap-3">
						<Link
							href="/sign-in"
							className="rounded-full px-5 py-2.5 text-sm font-medium text-text-dim hover:text-text transition-colors"
						>
							Sign in
						</Link>
						<Link
							href="/sign-in?signup=true"
							className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold bg-primary text-primary-fg hover:opacity-90 transition-opacity"
						>
							Start free
						</Link>
					</nav>
				</div>
			</header>

			{/* Page content */}
			{children}

			{/* Glow accents */}
			<div className="pointer-events-none fixed inset-0 -z-10">
				<div className="absolute right-[15%] top-[12%] h-60 w-60 rounded-full bg-primary/10 blur-3xl animate-float" />
				<div className="absolute left-[8%] bottom-[8%] h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-float" />
			</div>

			{/* Marketing footer */}
			<footer className="border-t border-edge/60 py-6 mt-12">
				<div className="mx-auto max-w-5xl px-4 sm:px-6">
					<div className="space-y-4">
						<div className="flex items-center justify-between flex-wrap gap-4 text-sm text-text-dim">
							<div className="flex items-center gap-2">
								<img
									src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png"
									alt="CRISP Content Engine"
									className="h-4 w-auto opacity-70"
									loading="lazy"
									width={1200}
									height={627}
								/>
								<span>© {new Date().getFullYear()} CRISP Content Engine</span>
							</div>
							<div className="flex items-center gap-4">
								<Link href="https://www.crispdigital.io/cookies-policy" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
									Cookies Policy
								</Link>
								<Link href="https://www.crispdigital.io/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
									Privacy Policy
								</Link>
								<Link href="https://www.crispdigital.io/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
									Terms of Service
								</Link>
								<SignOutLink />
							</div>
						</div>
						<div className="text-xs text-text-dim">
							Created and developed by CrisP Digital trading as ABL International FZE (3637)
						</div>
					</div>
				</div>
			</footer>
		</>
	);
}
