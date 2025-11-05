"use client";

import { SupabaseProvider } from "@/components/SupabaseProvider";
import { usePathname } from "next/navigation";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	// Provide Supabase for login page and homepage (both need auth)
	if (pathname === '/login' || pathname === '/') {
		return <SupabaseProvider>{children}</SupabaseProvider>;
	}
	return <>{children}</>;
}

