'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/skeletons/Skeleton';

type BrandProfile = {
	id: string;
	client_name: string;
	status: string;
	created_time: string;
	platforms_requested?: string[];
	strategy_summary?: string;
	strategy_payload?: any;
	strategy_meta?: any;
};

export function BrandProfilesList() {
	const [loading, setLoading] = useState(true);
	const [profiles, setProfiles] = useState<BrandProfile[]>([]);

	useEffect(() => {
		loadProfiles();
	}, []);

	async function loadProfiles() {
		setLoading(true);
		try {
			const res = await fetch('/api/brands', { cache: 'no-store' });
			const data = await res.json();
			if (res.ok) {
				setProfiles((data.profiles || []).map((profile: BrandProfile) => ({
					...profile,
					status: normaliseStatus(profile.status),
				})));
			}
		} catch (error) {
			console.error('Failed to load brand profiles:', error);
		} finally {
			setLoading(false);
		}
	}

	const normaliseStatus = (status: string) => {
		if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
		return status;
	};

	const getStatusIcon = (status: string) => {
		const normalised = normaliseStatus(status);
		switch (normalised) {
			case 'New Brief':
			case 'Needs Strategy':
				return <Clock className="w-4 h-4 text-warning" />;
			case 'Strategy Ready':
				return <FileText className="w-4 h-4 text-primary" />;
			case 'Strategy Approved':
			case 'Ready To Publish':
			case 'Published':
				return <CheckCircle className="w-4 h-4 text-accent" />;
			case 'Failed':
			case 'Error':
				return <XCircle className="w-4 h-4 text-danger" />;
			default:
				return <FileText className="w-4 h-4 text-text-dim" />;
		}
	};

	const getStatusColor = (status: string) => {
		const normalised = normaliseStatus(status);
		switch (normalised) {
			case 'New Brief':
			case 'Needs Strategy':
				return 'bg-warning/15 border-warning/30 text-warning';
			case 'Strategy Ready':
				return 'bg-primary/15 border-primary/30 text-primary';
			case 'Strategy Approved':
			case 'Ready To Publish':
			case 'Published':
				return 'bg-accent/15 border-accent/30 text-accent';
			case 'Failed':
			case 'Error':
				return 'bg-danger/15 border-danger/30 text-danger';
			default:
				return 'bg-surface/30 border-edge/60 text-text-dim';
		}
	};

	if (loading) {
		return (
			<div className="card p-6 space-y-4">
				<div className="flex items-center justify-between">
					<Skeleton height="24px" width="150px" />
					<Skeleton height="36px" width="100px" className="rounded-xl2" />
				</div>
				<div className="space-y-3">
					{Array.from({ length: 2 }).map((_, i) => (
						<div key={i} className="border border-edge/60 rounded-xl2 p-4 space-y-3">
							<div className="flex items-center gap-3">
								<Skeleton height="20px" width="200px" />
								<Skeleton height="24px" width="80px" className="rounded-full" />
							</div>
							<div className="flex gap-2">
								<Skeleton height="20px" width="60px" className="rounded" />
								<Skeleton height="20px" width="60px" className="rounded" />
							</div>
							<Skeleton height="14px" width="120px" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">Brand Profiles</h2>
				<Link
					href="/onboarding"
					className="px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center gap-2 text-sm"
				>
					<Plus className="w-4 h-4" />
					New Brand
				</Link>
			</div>

			{profiles.length === 0 ? (
				<div className="text-center py-8">
					<FileText className="w-12 h-12 text-text-dim mx-auto mb-4" />
					<p className="text-text-soft mb-2">No brand profiles yet</p>
					<p className="text-sm text-text-dim mb-4">
						Create your first brand profile to get started
					</p>
					<Link
						href="/onboarding"
						className="inline-block px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
					>
						Create Brand Profile
					</Link>
				</div>
			) : (
				<div className="space-y-3">
					{profiles.map((profile) => (
						<motion.div
							key={profile.id}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="border border-edge/60 rounded-xl2 p-4 hover:bg-surface/30 transition cursor-pointer"
						>
							<Link href={`/strategy/${profile.id}`}>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
											<h3 className="font-semibold text-lg">{profile.client_name}</h3>
											{getStatusIcon(profile.status)}
											<span
												className={`px-2 py-1 rounded-full text-xs border ${getStatusColor(profile.status)}`}
											>
												{normaliseStatus(profile.status)}
											</span>
										</div>
										{profile.platforms_requested && profile.platforms_requested.length > 0 && (
											<div className="flex items-center gap-2 mb-2">
												<span className="text-xs text-text-dim">Platforms:</span>
												<div className="flex gap-1 flex-wrap">
													{profile.platforms_requested.map((platform) => (
														<span
															key={platform}
															className="px-2 py-0.5 rounded text-xs bg-surface/50 border border-edge/60 text-text-soft"
														>
															{platform}
														</span>
													))}
												</div>
											</div>
										)}
										{profile.created_time && (
											<p className="text-xs text-text-dim">
												Created: {new Date(profile.created_time).toLocaleDateString()}
											</p>
										)}
									</div>
									{normaliseStatus(profile.status) === 'Strategy Ready' && (
										<span className="text-primary text-sm">Review →</span>
									)}
								</div>
							</Link>
						</motion.div>
					))}
				</div>
			)}
		</div>
	);
}

