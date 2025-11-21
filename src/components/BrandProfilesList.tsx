'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, CheckCircle, XCircle, Plus, Trash2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/skeletons/Skeleton';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

type BrandProfile = {
	id: string;
	client_name: string;
	status: string;
	original_status?: string;
	has_pending_content?: boolean;
	created_time: string;
	platforms_requested?: string[];
	strategy_summary?: string;
	strategy_payload?: any;
	strategy_meta?: any;
};

interface BrandProfilesListProps {
	maxBrands?: number;
	currentBrandCount?: number;
}

export function BrandProfilesList({ maxBrands = 999, currentBrandCount = 0 }: BrandProfilesListProps) {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [profiles, setProfiles] = useState<BrandProfile[]>([]);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [brandToDelete, setBrandToDelete] = useState<BrandProfile | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showBrandLimitModal, setShowBrandLimitModal] = useState(false);

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

	const handleNewBrandClick = (e: React.MouseEvent) => {
		if (currentBrandCount >= maxBrands) {
			e.preventDefault();
			setShowBrandLimitModal(true);
		}
	};

	const handleDeleteClick = (profile: BrandProfile) => {
		setBrandToDelete(profile);
		setDeleteModalOpen(true);
	};

	const handleDeleteConfirm = async () => {
		if (!brandToDelete) return;
		setIsDeleting(true);
		try {
			const res = await fetch(`/api/brands/${brandToDelete.id}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				// Remove from list
				setProfiles(profiles.filter((p) => p.id !== brandToDelete.id));
				setDeleteModalOpen(false);
				setBrandToDelete(null);
			} else {
				const data = await res.json();
				alert(data.error || 'Failed to delete brand');
			}
		} catch (error) {
			console.error('Failed to delete brand:', error);
			alert('Failed to delete brand. Please try again.');
		} finally {
			setIsDeleting(false);
		}
	};

	const getStatusIcon = (status: string) => {
		const normalised = normaliseStatus(status);
		switch (normalised) {
			case 'New Brief':
			case 'Needs Strategy':
				return <Clock className="w-4 h-4 text-warning" />;
			case 'Strategy Ready':
				return <FileText className="w-4 h-4 text-primary" />;
			case 'Content Review':
				return <FileText className="w-4 h-4 text-accent" />;
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
			case 'Content Review':
				return 'bg-accent/15 border-accent/30 text-accent';
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
			<div className="card p-4 md:p-6 space-y-4">
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
		<>
			<div className="card p-4 md:p-6 space-y-4">
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
					<h2 className="text-lg md:text-xl font-semibold">Brand Profiles</h2>
					<Link
						href="/onboarding"
						onClick={handleNewBrandClick}
						className="w-full sm:w-auto px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 flex items-center justify-center gap-2 text-sm"
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
							onClick={handleNewBrandClick}
							className="inline-block px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm"
						>
							Create Brand Profile
						</Link>
					</div>
				) : (
					<div className="space-y-3">
						{profiles.map((profile) => {
							const normalisedStatus = normaliseStatus(profile.status);
							const isContentReview = normalisedStatus === 'Content Review';
							const isStrategyReady = normalisedStatus === 'Strategy Ready';
							const isStrategyApproved = profile.original_status === 'Strategy Approved' || normalisedStatus === 'Strategy Approved';
							const hasPendingContent = profile.has_pending_content === true;
							
							// Determine href and action button
							let href = `/strategy/${profile.id}`;
							let actionButton = null;

							if (isContentReview) {
								href = '/content/approval';
							} else if (isStrategyReady) {
								// Strategy Ready - show "Strategy Ready For Approval" button with tooltip
								actionButton = (
									<Link
										href={href}
										onClick={(e) => e.stopPropagation()}
										className="px-3 md:px-4 py-2 rounded-xl2 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm text-primary font-medium flex items-center gap-2 relative group"
										title="Review and approve your strategy to generate content"
									>
										Strategy Ready For Approval
										<AlertCircle className="w-3.5 h-3.5 opacity-60" />
										{/* Tooltip */}
										<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-surface border border-edge/60 rounded-lg text-xs text-text-soft whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
											Review and approve your strategy to generate content
											<div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-edge/60" />
										</div>
									</Link>
								);
							} else if (isStrategyApproved) {
								// Strategy approved - always show Review Content button
								actionButton = (
									<Link
										href="/content/approval"
										onClick={(e) => e.stopPropagation()}
										className="px-3 md:px-4 py-2 rounded-xl2 border border-accent/40 bg-accent/10 hover:bg-accent/20 text-sm text-accent font-medium flex items-center gap-2"
									>
										Review Content
									</Link>
								);
							}

							return (
								<motion.div
									key={profile.id}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									className="border border-edge/60 rounded-xl2 p-3 md:p-4 hover:bg-surface/30 transition"
								>
									<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
										<Link href={href} className="flex-1 min-w-0">
											<div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
												<h3 className="font-semibold text-base md:text-lg break-words">{profile.client_name}</h3>
												{getStatusIcon(profile.status)}
												<span
													className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium border flex items-center justify-center min-w-[80px] md:min-w-[100px] text-center ${getStatusColor(profile.status)}`}
												>
													{normalisedStatus}
												</span>
											</div>
											{profile.platforms_requested && profile.platforms_requested.length > 0 && (
												<div className="flex items-center gap-2 mb-2 flex-wrap">
													<span className="text-xs text-text-dim">Platforms:</span>
													<div className="flex gap-1 flex-wrap">
														{profile.platforms_requested.map((platform) => (
															<span
																key={platform}
																className="px-2 py-0.5 rounded text-xs bg-surface/50 border border-edge/60 text-text-soft break-words"
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
										</Link>
										<div className="flex items-center gap-2 flex-shrink-0">
											{actionButton}
											{(isStrategyReady || isContentReview) && !actionButton && (
												<span className={`text-sm ${isContentReview ? 'text-accent' : 'text-primary'}`}>
													{isContentReview ? 'Review Content →' : 'Review →'}
												</span>
											)}
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick(profile);
												}}
												className="p-2 rounded-lg hover:bg-danger/10 text-danger transition-colors"
												title="Delete brand"
											>
												<Trash2 className="w-4 h-4" />
											</button>
										</div>
									</div>
								</motion.div>
							);
						})}
					</div>
				)}
			</div>

			{/* Delete Confirmation Modal */}
			<DeleteConfirmationModal
				isOpen={deleteModalOpen}
				onClose={() => {
					setDeleteModalOpen(false);
					setBrandToDelete(null);
				}}
				onConfirm={handleDeleteConfirm}
				title="Delete Brand Profile"
				itemName={brandToDelete?.client_name}
				isDeleting={isDeleting}
			/>

			{/* Brand Limit Modal */}
			{showBrandLimitModal && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4"
					onClick={() => setShowBrandLimitModal(false)}
				>
					<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
					<div
						className="relative z-10 w-full max-w-md card border border-warning/30 bg-surface/95 backdrop-blur-md shadow-2xl"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="p-6">
							<div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-warning/10 border border-warning/30">
								<AlertCircle className="w-8 h-8 text-warning" />
							</div>
							<h3 className="text-xl font-semibold text-center mb-2">Maximum Brands Reached</h3>
							<p className="text-text-dim text-center mb-6">
								You've reached the maximum number of brands for your plan ({maxBrands} brand{maxBrands !== 1 ? 's' : ''}).
								Please upgrade your package or create a new account to add more brands.
							</p>
							<div className="flex gap-3">
								<button
									onClick={() => setShowBrandLimitModal(false)}
									className="flex-1 px-4 py-2.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm font-medium transition-colors"
								>
									Close
								</button>
								<a
									href="/billing"
									className="flex-1 px-4 py-2.5 rounded-xl2 bg-primary hover:bg-primary/90 text-white text-sm font-medium text-center shadow-lg transition-all"
								>
									Upgrade Plan
								</a>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
