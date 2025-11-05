"use client";

import { SupabaseProvider } from "./SupabaseProvider";

export function SupabaseProviderWrapper({ children }: { children: React.ReactNode }) {
	return <SupabaseProvider>{children}</SupabaseProvider>;
}

