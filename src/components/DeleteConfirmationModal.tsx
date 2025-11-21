'use client';

import { X, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

interface DeleteConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	itemName?: string;
	isDeleting?: boolean;
}

export function DeleteConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	itemName,
	isDeleting = false,
}: DeleteConfirmationModalProps) {
	// Close on Escape key
	useEffect(() => {
		if (!isOpen) return;
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !isDeleting) {
				onClose();
			}
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [isOpen, isDeleting, onClose]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget && !isDeleting) {
					onClose();
				}
			}}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

			{/* Modal */}
			<div className="relative z-10 w-full max-w-md card border border-warning/30 bg-surface/95 backdrop-blur-md shadow-2xl">
				{/* Close button */}
				<button
					onClick={onClose}
					disabled={isDeleting}
					className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					aria-label="Close"
				>
					<X className="w-4 h-4 text-text-dim" />
				</button>

				{/* Content */}
				<div className="p-6">
					{/* Icon */}
					<div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-warning/10 border border-warning/30">
						<AlertTriangle className="w-8 h-8 text-warning" />
					</div>

					{/* Title */}
					<h3 className="text-xl font-semibold text-center mb-2">{title}</h3>

					{/* Warning message */}
					<p className="text-text-dim text-center mb-6">
						This action cannot be undone. {title.includes('Brand') ? 'The brand profile' : 'The post'} will be{' '}
						<span className="font-semibold text-warning">permanently deleted</span> and removed from Airtable.
						{itemName && (
							<>
								<br />
								<br />
								<span className="text-text-soft">"{itemName}"</span>
							</>
						)}
					</p>

					{/* Note about usage - only show for posts */}
					{!title.includes('Brand') && (
						<div className="mb-6 p-3 rounded-lg bg-surface/50 border border-edge/30">
							<p className="text-xs text-text-dim">
								<strong>Note:</strong> This post will still count towards your monthly usage limit.
							</p>
						</div>
					)}

					{/* Actions */}
					<div className="flex gap-3">
						<button
							onClick={onClose}
							disabled={isDeleting}
							className="flex-1 px-4 py-2.5 rounded-xl2 border border-edge/60 bg-surface/30 hover:bg-surface/50 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Cancel
						</button>
						<button
							onClick={onConfirm}
							disabled={isDeleting}
							className="flex-1 px-4 py-2.5 rounded-xl2 bg-gradient-to-r from-warning/90 to-warning/70 hover:from-warning hover:to-warning/90 text-white text-sm font-medium shadow-lg shadow-warning/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-warning/90 disabled:hover:to-warning/70"
						>
							{isDeleting ? 'Deleting...' : 'Delete Forever'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

