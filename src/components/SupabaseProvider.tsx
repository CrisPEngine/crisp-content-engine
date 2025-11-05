"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createContext, useContext, useMemo } from "react";

const SupabaseContext = createContext<any>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
	const supabase = useMemo(() => {
		// Only create client on client-side (not during SSR/build)
		if (typeof window === 'undefined') {
			return null;
		}
		try {
			const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
			const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
			
			if (!url || !key) {
				console.error('Missing Supabase environment variables');
				return null;
			}
			
			return createBrowserClient(url, key);
		} catch (error) {
			console.error('Failed to create Supabase client:', error);
			return null;
		}
	}, []);
	
	return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
	return useContext(SupabaseContext);
}

