"use client";

import { SupabaseProvider } from "@/components/SupabaseProvider";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
	return <SupabaseProvider>{children}</SupabaseProvider>;
}

