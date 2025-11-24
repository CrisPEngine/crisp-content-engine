"use client";

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	loading?: boolean;
	loadingText?: string;
	children: ReactNode;
	variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
	size?: 'sm' | 'md' | 'lg';
}

export function LoadingButton({
	loading = false,
	loadingText,
	children,
	variant = 'primary',
	size = 'md',
	className = '',
	disabled,
	...props
}: LoadingButtonProps) {
	const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-xl2 font-medium transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed';
	
	const variantClasses = {
		primary: 'border border-primary/40 bg-primary/10 text-text hover:bg-primary/20',
		secondary: 'border border-edge/60 bg-surface/50 text-text hover:bg-surface/70',
		danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
		ghost: 'border border-transparent bg-transparent text-text hover:bg-surface/50',
	};
	
	const sizeClasses = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-6 py-3 text-base',
		lg: 'px-8 py-4 text-lg',
	};
	
	const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
	
	return (
		<button
			{...props}
			disabled={disabled || loading}
			className={combinedClasses}
		>
			{loading && (
				<Loader2 className="w-4 h-4 animate-spin" />
			)}
			<span>{loading ? (loadingText || 'Loading...') : children}</span>
		</button>
	);
}

