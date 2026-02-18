'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useSupabase } from './SupabaseProvider';
import { APP_NAV, NavItem } from '@/lib/nav';

const LOGO_URL =
	'https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png';

function ChevronDown({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M4 6l4 4 4-4" />
		</svg>
	);
}

function MenuIcon() {
	return (
		<svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
			<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
		</svg>
	);
}

function isActive(pathname: string, item: NavItem): boolean {
	if (item.href) return pathname === item.href || pathname.startsWith(item.href + '/');
	return item.items?.some((sub) => pathname === sub.href || pathname.startsWith(sub.href + '/')) ?? false;
}

function isSubActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(href + '/');
}

export function AppHeader() {
	const pathname = usePathname();
	const router = useRouter();
	const supabase = useSupabase();

	const [user, setUser] = useState<{ email: string; initials: string } | null>(null);
	const [openDropdown, setOpenDropdown] = useState<string | null>(null);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
	const navRef = useRef<HTMLDivElement>(null);

	// Don't render on public pages
	if (pathname === '/sign-in' || pathname === '/login' || pathname === '/') {
		return null;
	}

	// Fetch user
	useEffect(() => {
		if (!supabase) return;
		supabase.auth.getUser().then(({ data: { user } }: any) => {
			if (!user) return;
			const name: string = user.user_metadata?.full_name || user.email || '';
			const initials = name
				.split(/[\s@.]+/)
				.filter(Boolean)
				.map((n: string) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
			setUser({ email: user.email || '', initials });
		});
	}, [supabase]);

	// Close dropdown on outside click
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (navRef.current && !navRef.current.contains(e.target as Node)) {
				setOpenDropdown(null);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, []);

	// Close mobile nav on route change
	useEffect(() => {
		setMobileOpen(false);
		setOpenDropdown(null);
	}, [pathname]);

	const handleSignOut = async () => {
		if (supabase) {
			await supabase.auth.signOut();
			router.push('/');
		}
	};

	const toggleDropdown = (key: string) =>
		setOpenDropdown((prev) => (prev === key ? null : key));

	return (
		<div className="fixed top-0 left-0 right-0 z-50" ref={navRef}>
		<header className="backdrop-blur-md bg-[#080808]/90 border-b border-white/[0.08] h-[140px] flex items-center">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 w-full flex items-center gap-4">

				{/* Logo */}
				<Link href="/dashboard" className="flex items-center shrink-0 mr-2">
					<img
						src={LOGO_URL}
						alt="CRISP Content Engine"
						className="h-20 w-auto"
						width={1200}
						height={627}
					/>
					</Link>

					{/* Desktop nav */}
					<nav className="hidden md:flex items-center gap-0.5 flex-1">
						{APP_NAV.map((item) => {
							const active = isActive(pathname, item);
							if (!item.items) {
								return (
									<Link
										key={item.label}
										href={item.href!}
										className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
											active
												? 'text-white bg-white/10'
												: 'text-white/55 hover:text-white hover:bg-white/[0.06]'
										}`}
									>
										{item.label}
									</Link>
								);
							}

							const open = openDropdown === item.label;
							return (
								<div key={item.label} className="relative">
									<button
										onClick={() => toggleDropdown(item.label)}
										className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${
											active
												? 'text-white bg-white/10'
												: 'text-white/55 hover:text-white hover:bg-white/[0.06]'
										}`}
									>
										{item.label}
										<ChevronDown
											className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
										/>
									</button>

									{open && (
										<div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl bg-[#111]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/60 py-1.5 z-50">
											{item.items.map((sub) => (
												<Link
													key={sub.href}
													href={sub.href}
													onClick={() => setOpenDropdown(null)}
													className={`flex items-center px-3.5 py-2 text-sm rounded-lg mx-1 transition-colors ${
														isSubActive(pathname, sub.href)
															? 'text-white bg-white/10'
															: 'text-white/60 hover:text-white hover:bg-white/[0.07]'
													}`}
												>
													{sub.label}
												</Link>
											))}
										</div>
									)}
								</div>
							);
						})}
					</nav>

					{/* Right: user avatar + mobile hamburger */}
					<div className="ml-auto flex items-center gap-2">
						{/* User menu — desktop */}
						<div className="hidden md:block relative">
							<button
								onClick={() => toggleDropdown('user')}
								className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
							>
								{user?.initials ?? '…'}
							</button>

							{openDropdown === 'user' && (
								<div className="absolute top-full right-0 mt-1.5 w-52 rounded-xl bg-[#111]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/60 py-1.5 z-50">
									<div className="px-3.5 py-2 border-b border-white/[0.08] mb-1">
										<p className="text-xs text-white/40 truncate">{user?.email ?? 'Signed in'}</p>
									</div>
									<Link
										href="/connections"
										onClick={() => setOpenDropdown(null)}
										className="flex items-center px-3.5 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.07] rounded-lg mx-1 transition-colors"
									>
										Connections
									</Link>
									<div className="my-1 border-t border-white/[0.08]" />
									<button
										onClick={handleSignOut}
										className="w-full flex items-center px-3.5 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.07] rounded-lg mx-1 transition-colors"
									>
										Sign out
									</button>
								</div>
							)}
						</div>

						{/* Hamburger — mobile */}
						<button
							onClick={() => setMobileOpen((v) => !v)}
							className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
							aria-label="Toggle menu"
						>
							{mobileOpen ? <CloseIcon /> : <MenuIcon />}
						</button>
					</div>
				</div>
			</header>

			{/* Mobile nav panel */}
			{mobileOpen && (
				<div className="md:hidden bg-[#0a0a0a]/98 backdrop-blur-xl border-b border-white/[0.08] pb-4">
					<nav className="px-4 pt-3 space-y-0.5">
						{APP_NAV.map((item) => {
							if (!item.items) {
								return (
									<Link
										key={item.label}
										href={item.href!}
										className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
											isActive(pathname, item)
												? 'text-white bg-white/10'
												: 'text-white/60 hover:text-white hover:bg-white/[0.06]'
										}`}
									>
										{item.label}
									</Link>
								);
							}

							const expanded = mobileExpanded === item.label;
							return (
								<div key={item.label}>
									<button
										onClick={() =>
											setMobileExpanded((prev) => (prev === item.label ? null : item.label))
										}
										className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
											isActive(pathname, item)
												? 'text-white bg-white/10'
												: 'text-white/60 hover:text-white hover:bg-white/[0.06]'
										}`}
									>
										{item.label}
										<ChevronDown
											className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
										/>
									</button>
									{expanded && (
										<div className="ml-3 mt-0.5 space-y-0.5 pl-3 border-l border-white/[0.08]">
											{item.items.map((sub) => (
												<Link
													key={sub.href}
													href={sub.href}
													className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
														isSubActive(pathname, sub.href)
															? 'text-white bg-white/10'
															: 'text-white/55 hover:text-white hover:bg-white/[0.06]'
													}`}
												>
													{sub.label}
												</Link>
											))}
										</div>
									)}
								</div>
							);
						})}
					</nav>

					{/* Mobile user section */}
					<div className="px-4 mt-3 pt-3 border-t border-white/[0.08] space-y-0.5">
						<p className="px-3 pb-1 text-xs text-white/30 truncate">{user?.email}</p>
						<Link
							href="/connections"
							className="flex items-center px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
						>
							Connections
						</Link>
						<button
							onClick={handleSignOut}
							className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.06] transition-colors"
						>
							Sign out
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
