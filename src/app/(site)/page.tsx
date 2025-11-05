import Link from 'next/link';

export default function Home() {
	return (
		<div className="mx-auto max-w-2xl text-center py-20">
			<h1 className="text-4xl font-semibold mb-4">CrisP Content Engine</h1>
			<p className="text-text-dim mb-8">Generate, schedule, and publish high-performing content with AI.</p>
			<div className="flex gap-4 justify-center">
				<Link href="/login" className="px-6 py-3 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20">
					Get Started
				</Link>
				<Link href="/billing" className="px-6 py-3 rounded-xl2 border border-edge/60 bg-surface/70 hover:bg-surface/90">
					View Plans
				</Link>
			</div>
		</div>
	);
}
