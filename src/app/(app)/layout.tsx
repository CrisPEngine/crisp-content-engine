import { SupabaseProviderWrapper } from "@/components/SupabaseProviderWrapper";
import { AppHeader } from "@/components/AppHeader";
import { PublishHealthBanner } from "@/components/publish/PublishHealthBanner";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<SupabaseProviderWrapper>
			<AppHeader />
			<div className="min-w-0 overflow-x-hidden pt-24">
				<PublishHealthBanner />
				{children}
			</div>
		</SupabaseProviderWrapper>
	);
}
