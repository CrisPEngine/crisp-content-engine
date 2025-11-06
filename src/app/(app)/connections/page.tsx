'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Link2, ExternalLink } from 'lucide-react';

type Connection = {
	platform: string;
	connected: boolean;
	account_name?: string;
	connected_at?: string;
};

const PLATFORMS = [
	{ id: 'linkedin', name: 'LinkedIn', icon: '💼', color: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
	{ id: 'twitter', name: 'X (Twitter)', icon: '🐦', color: 'bg-black/20 border-black/30 text-white' },
	{ id: 'instagram', name: 'Instagram', icon: '📷', color: 'bg-pink-500/20 border-pink-500/30 text-pink-400' },
	{ id: 'facebook', name: 'Facebook', icon: '👥', color: 'bg-blue-600/20 border-blue-600/30 text-blue-300' },
	{ id: 'buffer', name: 'Buffer', icon: '📊', color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
] as const;

export default function ConnectionsPage() {
	const supabase = useSupabase();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [connections, setConnections] = useState<Connection[]>([]);
	const [connecting, setConnecting] = useState<string | null>(null);

	useEffect(() => {
		if (!supabase) return;
		loadConnections();
	}, [supabase]);

	async function loadConnections() {
		if (!supabase) return;
		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			// TODO: Replace with actual API call to fetch connections
			// const res = await fetch('/api/connections');
			// const data = await res.json();
			// setConnections(data.connections || []);

			// Placeholder data
			setConnections(
				PLATFORMS.map((p) => ({
					platform: p.id,
					connected: false,
				}))
			);
		} catch (error) {
			console.error('Failed to load connections:', error);
		} finally {
			setLoading(false);
		}
	}

	async function connectPlatform(platformId: string) {
		if (!supabase) return;
		setConnecting(platformId);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				router.push('/login');
				return;
			}

			// TODO: Replace with actual OAuth flow
			// For now, this is a placeholder
			// In production, you'd:
			// 1. Redirect to OAuth provider
			// 2. Handle callback
			// 3. Store connection in database

			// Example: LinkedIn OAuth
			if (platformId === 'linkedin') {
				// Redirect to LinkedIn OAuth
				// window.location.href = `/api/connections/linkedin/authorize`;
				alert('OAuth connection will be implemented. This will redirect to LinkedIn for authorization.');
			} else {
				// For other platforms, show placeholder
				alert(`${PLATFORMS.find((p) => p.id === platformId)?.name} connection will be implemented.`);
			}
		} catch (error) {
			console.error('Failed to connect platform:', error);
			alert('Failed to connect. Please try again.');
		} finally {
			setConnecting(null);
		}
	}

	async function disconnectPlatform(platformId: string) {
		if (!supabase) return;
		try {
			// TODO: Replace with actual API call
			// await fetch(`/api/connections/${platformId}`, { method: 'DELETE' });
			
			setConnections((prev) =>
				prev.map((c) => (c.platform === platformId ? { ...c, connected: false } : c))
			);
			alert('Platform disconnected successfully');
		} catch (error) {
			console.error('Failed to disconnect platform:', error);
			alert('Failed to disconnect. Please try again.');
		}
	}

	if (loading) {
		return (
			<div className="mx-auto max-w-4xl">
				<div className="card p-8 text-center">
					<Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
					<p className="text-text-soft">Loading connections...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl">
			<div className="mb-6">
				<button
					onClick={() => router.back()}
					className="text-text-soft hover:text-text text-sm inline-flex items-center gap-1"
				>
					← Back
				</button>
			</div>

			<div className="mb-6">
				<h1 className="text-3xl font-semibold mb-2">Social Media Connections</h1>
				<p className="text-text-dim">
					Connect your social media accounts to enable content publishing
				</p>
			</div>

			<div className="space-y-4">
				{PLATFORMS.map((platform) => {
					const connection = connections.find((c) => c.platform === platform.id);
					const isConnected = connection?.connected || false;
					const isConnecting = connecting === platform.id;

					return (
						<motion.div
							key={platform.id}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="card p-6"
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-4 flex-1">
									<div className="text-4xl">{platform.icon}</div>
									<div className="flex-1">
										<h3 className="text-lg font-semibold mb-1">{platform.name}</h3>
										{isConnected ? (
											<div className="space-y-1">
												<div className="flex items-center gap-2 text-sm text-accent">
													<CheckCircle className="w-4 h-4" />
													<span>Connected</span>
												</div>
												{connection?.account_name && (
													<p className="text-xs text-text-dim">
														Account: {connection.account_name}
													</p>
												)}
												{connection?.connected_at && (
													<p className="text-xs text-text-dim">
														Connected: {new Date(connection.connected_at).toLocaleDateString()}
													</p>
												)}
											</div>
										) : (
											<p className="text-sm text-text-dim">
												Not connected. Connect to enable publishing to {platform.name}.
											</p>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									{isConnected ? (
										<button
											onClick={() => disconnectPlatform(platform.id)}
											className="px-4 py-2 rounded-xl2 border border-danger/40 bg-danger/10 hover:bg-danger/20 text-sm flex items-center gap-2"
										>
											<XCircle className="w-4 h-4" />
											Disconnect
										</button>
									) : (
										<button
											onClick={() => connectPlatform(platform.id)}
											disabled={isConnecting}
											className={`px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${platform.color}`}
										>
											{isConnecting ? (
												<>
													<Loader2 className="w-4 h-4 animate-spin" />
													Connecting...
												</>
											) : (
												<>
													<Link2 className="w-4 h-4" />
													Connect
												</>
											)}
										</button>
									)}
								</div>
							</div>
						</motion.div>
					);
				})}
			</div>

			<div className="mt-8 card p-6 bg-primary/5 border-primary/20">
				<h3 className="font-semibold mb-2 flex items-center gap-2">
					<ExternalLink className="w-4 h-4" />
					When to Connect Accounts
				</h3>
				<p className="text-sm text-text-dim">
					Connect your social media accounts after your brand strategy has been approved. This allows
					the AI to publish content directly to your connected platforms.
				</p>
			</div>
		</div>
	);
}

