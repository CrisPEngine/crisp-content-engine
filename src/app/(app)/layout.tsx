"use client";

import { SupabaseProvider } from "@/components/SupabaseProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return <SupabaseProvider>{children}</SupabaseProvider>;
}

