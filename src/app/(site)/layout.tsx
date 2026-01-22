"use client";

import { SupabaseProvider } from "@/components/SupabaseProvider";
import { usePathname } from "next/navigation";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	// Provide Supabase for sign-in/login and billing pages
	if (pathname === '/sign-in' || pathname === '/login' || pathname === '/billing') {
		return <SupabaseProvider>{children}</SupabaseProvider>;
	}
	return <>{children}</>;
}

