import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function LoginPage({ searchParams }: { searchParams?: Record<string, string | string[]> }) {
	const params = new URLSearchParams();
	if (searchParams) {
		Object.entries(searchParams).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				value.forEach((item) => params.append(key, item));
			} else if (value) {
				params.set(key, value);
			}
		});
	}
	const query = params.toString();
	redirect(query ? `/sign-in?${query}` : '/sign-in');
}


