"use client";

import { SupabaseProvider } from "@/components/SupabaseProvider";
import { usePathname } from "next/navigation";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	// Only provide Supabase for login page (needs auth)
	if (pathname === '/login') {
		return <SupabaseProvider>{children}</SupabaseProvider>;
	}
	return <>{children}</>;
}

