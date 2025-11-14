'use client';

import { motion } from 'framer-motion';

// Base skeleton component with shimmer animation
export function Skeleton({ className = '', width, height }: { className?: string; width?: string | number; height?: string | number }) {
	return (
		<motion.div
			className={`skeleton-shimmer ${className}`}
			style={{ width, height }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
		/>
	);
}

// Card skeleton
export function CardSkeleton({ className = '' }: { className?: string }) {
	return (
		<div className={`card p-6 space-y-4 ${className}`}>
			<Skeleton height="24px" width="60%" />
			<Skeleton height="16px" width="100%" />
			<Skeleton height="16px" width="80%" />
		</div>
	);
}

// Text line skeleton
export function TextSkeleton({ lines = 1, className = '' }: { lines?: number; className?: string }) {
	return (
		<div className={`space-y-2 ${className}`}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton key={i} height="16px" width={i === lines - 1 ? '60%' : '100%'} />
			))}
		</div>
	);
}

// Button skeleton
export function ButtonSkeleton({ className = '' }: { className?: string }) {
	return <Skeleton height="40px" width="120px" className={`rounded-xl2 ${className}`} />;
}

// Badge skeleton
export function BadgeSkeleton({ className = '' }: { className?: string }) {
	return <Skeleton height="24px" width="80px" className={`rounded-full ${className}`} />;
}

// Profile card skeleton
export function ProfileCardSkeleton() {
	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center gap-3">
				<Skeleton height="48px" width="48px" className="rounded-full" />
				<div className="flex-1 space-y-2">
					<Skeleton height="20px" width="40%" />
					<Skeleton height="16px" width="60%" />
				</div>
			</div>
			<div className="space-y-2">
				<Skeleton height="16px" width="100%" />
				<Skeleton height="16px" width="80%" />
			</div>
			<div className="flex gap-2">
				<BadgeSkeleton />
				<BadgeSkeleton />
			</div>
		</div>
	);
}

// Content item skeleton
export function ContentItemSkeleton() {
	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-start justify-between">
				<div className="flex-1 space-y-3">
					<div className="flex items-center gap-3">
						<Skeleton height="24px" width="200px" />
						<BadgeSkeleton />
						<BadgeSkeleton />
					</div>
					<TextSkeleton lines={2} />
					<div className="flex items-center gap-2">
						<Skeleton height="16px" width="100px" />
						<Skeleton height="16px" width="120px" />
					</div>
				</div>
				<ButtonSkeleton />
			</div>
			<div className="flex gap-3 pt-4 border-t border-edge/60">
				<ButtonSkeleton />
				<ButtonSkeleton />
			</div>
		</div>
	);
}

// Usage card skeleton
export function UsageCardSkeleton() {
	return (
		<div className="card p-6 space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton height="16px" width="80px" />
					<Skeleton height="24px" width="150px" />
				</div>
				<ButtonSkeleton />
			</div>
			<Skeleton height="16px" width="120px" />
			<Skeleton height="8px" width="100%" className="rounded-full" />
			<Skeleton height="16px" width="100px" />
		</div>
	);
}

