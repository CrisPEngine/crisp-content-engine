'use client';

import { useSupabase } from '@/components/SupabaseProvider';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Linkedin, Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export function LoginClient() {
	const supabase = useSupabase();
	const [mounted, setMounted] = useState(false);
	const searchParams = useSearchParams();
	const [authView, setAuthView] = useState<'sign_in' | 'update_password'>('sign_in');
	
	useEffect(() => {
		setMounted(true);
		// Check if this is a password reset flow
		const type = searchParams?.get('type');
		const token = searchParams?.get('token');
		const tokenHash = searchParams?.get('token_hash');
		if (type === 'recovery' && (token || tokenHash)) {
			setAuthView('update_password');
		}
	}, [searchParams]);

	const handleLinkedInSignIn = async () => {
		if (!supabase) return;
		try {
			await supabase.auth.signInWithOAuth({
				provider: 'linkedin_oidc',
				options: {
					redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://app.crispdigital.io/auth/callback',
				},
			});
		} catch (error) {
			console.error('LinkedIn sign-in failed', error);
		}
	};

	const handleGoogleSignIn = async () => {
		if (!supabase) return;
		try {
			await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://app.crispdigital.io/auth/callback',
				},
			});
		} catch (error) {
			console.error('Google sign-in failed', error);
		}
	};
	
	// Fallback if Supabase isn't ready yet or not mounted
	if (!mounted || !supabase) {
		return (
			<div className="mx-auto max-w-lg px-6">
				<div className="card p-8 mt-16">
					<div className="text-text-soft">Loading...</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-lg px-6">
			<motion.section
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4 }}
				className="card p-8 mt-8"
			>
				<div className="mb-8 rounded-xl2 border border-edge/60 p-6 bg-gradient-to-br from-surface/70 to-surface/30">
					<h2 className="text-lg font-medium">CRISP Content Engine</h2>
					<p className="text-sm text-text-dim mt-1">Your content workflow just leveled up. Create, schedule and automatically publish social & blog content with AI that understands your brand.</p>
				</div>
				<div className="mb-6">
					<h1 className="text-2xl font-semibold">{authView === 'update_password' ? 'Update Password' : 'Sign in'}</h1>
					<p className="mt-1 text-text-dim">
						{authView === 'update_password' 
							? 'Enter your new password below.' 
							: 'Access your AI content studio — secure & private.'}
					</p>
				</div>
				{authView === 'sign_in' && (
					<div className="space-y-3">
						<button
							onClick={handleGoogleSignIn}
							type="button"
							className="w-full flex items-center justify-center gap-2 rounded-xl2 border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-text hover:bg-primary/20 transition"
						>
							<Mail className="w-4 h-4" />
							Sign in with Google
						</button>
						<button
							onClick={handleLinkedInSignIn}
							type="button"
							className="w-full flex items-center justify-center gap-2 rounded-xl2 border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-text hover:bg-primary/20 transition"
						>
							<Linkedin className="w-4 h-4" />
							Sign in with LinkedIn
						</button>
					</div>
				)}
				<div className="mt-6">
					<Auth
						supabaseClient={supabase}
						view={authView}
						providers={[]}
						redirectTo={typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : 'https://app.crispdigital.io/auth/callback'}
						appearance={{
							theme: ThemeSupa,
							variables: {
								default: {
									colors: {
										brand: '#8AB4F8',
										brandAccent: '#4FF0B8',
										inputBackground: '#0B0F12',
										inputText: '#E6EAF2',
										inputBorder: '#1A2230',
										messageText: '#E6EAF2',
									},
									radii: { inputBorderRadius: '12px', buttonBorderRadius: '12px' },
									space: { inputPadding: '12px' },
									fonts: { bodyFontFamily: 'Inter, system-ui, sans-serif' },
								},
							},
							className: {
								container: 'space-y-4',
								button: 'bg-primary/10 hover:bg-primary/20 text-text border border-primary/30 shadow-glow',
								input: 'bg-bg/80 border border-edge/80 focus:border-primary/60 focus:ring-0',
								divider: 'text-text-soft',
								label: 'text-text-soft',
								message: 'bg-surface/80 border border-edge/60 text-text rounded-xl2 p-4',
								messageSuccess: 'bg-primary/20 border border-primary/40 text-primary rounded-xl2 p-4',
								messageDanger: 'bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl2 p-4',
							},
						}}
					/>
				</div>
			</motion.section>
			<p className="mt-6 text-center text-xs text-text-dim">By continuing you agree to our Terms & Privacy.</p>
		</div>
	);
}

