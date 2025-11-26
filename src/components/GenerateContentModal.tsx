'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles } from 'lucide-react';
import { useUsage } from '@/lib/useUsage';

type BrandProfile = {
	id: string;
	client_name: string;
	platforms_requested?: string[];
	status: string;
	strategy_summary?: string;
};

type GenerateContentModalProps = {
	isOpen: boolean;
	onClose: () => void;
	brandProfiles: BrandProfile[];
};

const PLATFORMS = ['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog'];

export function GenerateContentModal({ isOpen, onClose, brandProfiles }: GenerateContentModalProps) {
	const [selectedBrand, setSelectedBrand] = useState<string>('');
	const [selectedPlatform, setSelectedPlatform] = useState<string>('');
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const { data: usageData } = useUsage();

	// Filter brands that have approved strategies
	const eligibleBrands = brandProfiles.filter((brand) => {
		const status = (brand.status || '').toLowerCase();
		return status.includes('approved') || status === 'strategy approved';
	});

	// Reset form when modal opens/closes
	useEffect(() => {
		if (!isOpen) {
			setSelectedBrand('');
			setSelectedPlatform('');
			setError(null);
			setSuccess(false);
		}
	}, [isOpen]);

	// Auto-select first eligible brand if only one
	useEffect(() => {
		if (isOpen && eligibleBrands.length === 1 && !selectedBrand) {
			setSelectedBrand(eligibleBrands[0].id);
			// Auto-select first platform if brand has platforms_requested
			if (eligibleBrands[0].platforms_requested && eligibleBrands[0].platforms_requested.length > 0) {
				setSelectedPlatform(eligibleBrands[0].platforms_requested[0]);
			}
		}
	}, [isOpen, eligibleBrands, selectedBrand]);

	async function handleGenerate() {
		if (!selectedBrand || !selectedPlatform) {
			setError('Please select both a brand and a platform');
			return;
		}

		setGenerating(true);
		setError(null);
		setSuccess(false);

		try {
			const res = await fetch('/api/content/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: selectedBrand,
					platform: selectedPlatform,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to generate content');
			}

			setSuccess(true);
			// Close modal after 2 seconds
			setTimeout(() => {
				onClose();
				// Optionally refresh the page or reload content
				window.location.reload();
			}, 2000);
		} catch (err: any) {
			console.error('Content generation error:', err);
			setError(err.message || 'Failed to generate content. Please try again.');
		} finally {
			setGenerating(false);
		}
	}

	const selectedBrandData = eligibleBrands.find((b) => b.id === selectedBrand);
	const availablePlatforms = selectedBrandData?.platforms_requested || PLATFORMS;
	const remainingPosts = (usageData?.caps?.posts_per_month || 999999) - (usageData?.usage?.posts || 0);

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				{/* Backdrop */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={onClose}
					className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				/>

				{/* Modal */}
				<motion.div
					initial={{ opacity: 0, scale: 0.95, y: 20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: 20 }}
					className="relative card p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
				>
					{/* Close button */}
					<button
						onClick={onClose}
						disabled={generating}
						className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface/50 text-text-dim transition disabled:opacity-50"
					>
						<X className="w-5 h-5" />
					</button>

					{/* Header */}
					<div className="mb-6">
						<div className="flex items-center gap-3 mb-2">
							<Sparkles className="w-6 h-6 text-primary" />
							<h2 className="text-2xl font-semibold">Generate More Content</h2>
						</div>
						<p className="text-sm text-text-dim">
							Create additional content for your brand within your monthly allowance.
						</p>
						{remainingPosts < 999999 && (
							<p className="text-xs text-text-soft mt-2">
								Remaining posts this month: <span className="font-medium text-primary">{remainingPosts}</span>
							</p>
						)}
					</div>

					{/* Success message */}
					{success && (
						<div className="mb-4 p-4 rounded-xl2 bg-accent/10 border border-accent/30">
							<p className="text-accent font-medium text-sm">
								Content generation started! New content will appear in your approval queue shortly.
							</p>
						</div>
					)}

					{/* Error message */}
					{error && (
						<div className="mb-4 p-4 rounded-xl2 bg-danger/10 border border-danger/30">
							<p className="text-danger font-medium text-sm">{error}</p>
						</div>
					)}

					{/* Form */}
					{!success && (
						<div className="space-y-6">
							{/* Brand Selection */}
							<div>
								<label className="block text-sm font-medium text-text-soft mb-2">
									Select Brand <span className="text-danger">*</span>
								</label>
								{eligibleBrands.length === 0 ? (
									<div className="p-4 rounded-xl2 bg-warning/10 border border-warning/30">
										<p className="text-warning text-sm">
											No brands with approved strategies found. Please approve a strategy first.
										</p>
									</div>
								) : (
									<select
										value={selectedBrand}
										onChange={(e) => {
											setSelectedBrand(e.target.value);
											setSelectedPlatform(''); // Reset platform when brand changes
										}}
										disabled={generating}
										className="w-full px-4 py-3 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<option value="">Choose a brand...</option>
										{eligibleBrands.map((brand) => (
											<option key={brand.id} value={brand.id}>
												{brand.client_name}
											</option>
										))}
									</select>
								)}
							</div>

							{/* Platform Selection */}
							{selectedBrand && (
								<div>
									<label className="block text-sm font-medium text-text-soft mb-2">
										Select Platform <span className="text-danger">*</span>
									</label>
									<select
										value={selectedPlatform}
										onChange={(e) => setSelectedPlatform(e.target.value)}
										disabled={generating}
										className="w-full px-4 py-3 rounded-xl2 border border-edge/60 bg-bg/80 text-text focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<option value="">Choose a platform...</option>
										{availablePlatforms.map((platform) => (
											<option key={platform} value={platform}>
												{platform}
											</option>
										))}
									</select>
								</div>
							)}

							{/* Generate Button */}
							<div className="flex gap-3 pt-4">
								<button
									onClick={onClose}
									disabled={generating}
									className="flex-1 px-4 py-3 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-text disabled:opacity-50"
								>
									Cancel
								</button>
								<button
									onClick={handleGenerate}
									disabled={generating || !selectedBrand || !selectedPlatform || eligibleBrands.length === 0}
									className="flex-1 px-4 py-3 rounded-xl2 bg-gradient-to-r from-primary/90 to-primary/70 hover:from-primary hover:to-primary/90 text-white font-medium shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{generating ? (
										<>
											<Loader2 className="w-4 h-4 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<Sparkles className="w-4 h-4" />
											Generate Content
										</>
									)}
								</button>
							</div>
						</div>
					)}
				</motion.div>
			</div>
		</AnimatePresence>
	);
}

