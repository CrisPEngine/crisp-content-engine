import { SupabaseProviderWrapper } from "@/components/SupabaseProviderWrapper";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return <SupabaseProviderWrapper>{children}</SupabaseProviderWrapper>;
}

