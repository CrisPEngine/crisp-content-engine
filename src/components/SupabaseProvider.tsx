"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createContext, useContext, useMemo } from "react";

const SupabaseContext = createContext<any>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
	const supabase = useMemo(
		() =>
			createBrowserClient(
				process.env.NEXT_PUBLIC_SUPABASE_URL!,
				process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
			),
		[]
	);
	return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
	return useContext(SupabaseContext);
}

