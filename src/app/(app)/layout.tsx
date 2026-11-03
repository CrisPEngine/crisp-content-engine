import { SupabaseProviderWrapper } from "@/components/SupabaseProviderWrapper";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<SupabaseProviderWrapper>
			<AppHeader />
			<div className="min-w-0 overflow-x-hidden pt-[calc(4.25rem+env(safe-area-inset-top,0px))] md:pt-24">
				{children}
			</div>
		</SupabaseProviderWrapper>
	);
}

