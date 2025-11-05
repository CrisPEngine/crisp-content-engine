"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createContext, useContext, useState, useEffect } from "react";

const SupabaseContext = createContext<any>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
	const [supabase, setSupabase] = useState<any>(null);
	
	useEffect(() => {
		// Only create client on client-side after mount
		if (typeof window !== 'undefined') {
			try {
				const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
				const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
				
				if (!url || !key) {
					console.error('Missing Supabase environment variables');
					return;
				}
				
				const client = createBrowserClient(url, key);
				setSupabase(client);
			} catch (error) {
				console.error('Failed to create Supabase client:', error);
			}
		}
	}, []);
	
	return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
	return useContext(SupabaseContext);
}

