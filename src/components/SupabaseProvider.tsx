"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createContext, useContext, useMemo, useEffect, useState } from "react";

const SupabaseContext = createContext<any>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
	const [supabase, setSupabase] = useState<any>(null);
	
	useEffect(() => {
		// Only create client on client-side after mount
		if (typeof window !== 'undefined') {
			const client = createBrowserClient(
				process.env.NEXT_PUBLIC_SUPABASE_URL!,
				process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
			);
			setSupabase(client);
		}
	}, []);
	
	if (!supabase) {
		// Return children without provider during SSR/initial render
		return <>{children}</>;
	}
	
	return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
	return useContext(SupabaseContext);
}

