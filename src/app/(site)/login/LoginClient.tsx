'use client';

import { useSupabase } from '@/components/SupabaseProvider';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Linkedin, Mail } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

export function LoginClient() {
	const supabase = useSupabase();
	const router = useRouter();
	const [mounted, setMounted] = useState(false);
	const searchParams = useSearchParams();
	const [authView, setAuthView] = useState<'sign_in' | 'update_password'>('sign_in');
	const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
	
	// Check if user is already signed in and redirect if so (unless in recovery flow)
	useEffect(() => {
		if (!supabase || !mounted) return;
		
		const checkSession = async () => {
			const { data: { session } } = await supabase.auth.getSession();
			const type = searchParams?.get('type');
			// If user is signed in and not in recovery flow, redirect to dashboard
			if (session && type !== 'recovery') {
				console.log('User already signed in, redirecting to dashboard');
				router.replace('/dashboard');
			}
		};
		
		checkSession();
	}, [supabase, mounted, searchParams, router]);

	useEffect(() => {
		setMounted(true);
		// Check if this is a password reset flow
		const type = searchParams?.get('type');
		const token = searchParams?.get('token');
		const tokenHash = searchParams?.get('token_hash');
		const error = searchParams?.get('error');
		const errorDescription = searchParams?.get('error_description');
		
		if (error) {
			console.error('Login error:', { error, errorDescription });
			// If there's an error (like expired token), show a message
			// The Auth component should handle displaying this
		}
		
		// Handle password reset flow
		// For token_hash, we need to verify it to establish a session
		if (type === 'recovery' && tokenHash && supabase) {
			console.log('Password reset flow detected with token_hash, verifying...', { 
				type, 
				hasTokenHash: !!tokenHash
			});
			
			// Verify token_hash to establish session before showing password update form
			// Use the REST API approach since verifyOtp might not work for recovery token_hash
			const verifyToken = async () => {
				try {
					// Use exchangeCodeForSession with the token_hash
					// Actually, for recovery token_hash, we need to use a different approach
					// Let's try using the Supabase REST API to verify
					const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
					if (!supabaseUrl) {
						console.error('Missing Supabase URL');
						return;
					}

					// For recovery token_hash, we can use verifyOtp but need to pass it correctly
					const { data, error } = await supabase.auth.verifyOtp({
						token_hash: tokenHash,
						type: 'recovery',
					});

					if (error) {
						console.error('Error verifying recovery token:', error);
						// Still show the form - Auth UI might handle it differently
						setAuthView('update_password');
						setIsRecoveryFlow(true);
					} else if (data?.session) {
						console.log('Recovery token verified, session established');
						setAuthView('update_password');
						setIsRecoveryFlow(true);
					} else {
						console.warn('Token verification returned no session');
						// Show form anyway - might work
						setAuthView('update_password');
						setIsRecoveryFlow(true);
					}
				} catch (err) {
					console.error('Exception verifying token:', err);
					// Show form anyway
					setAuthView('update_password');
					setIsRecoveryFlow(true);
				}
			};

			verifyToken();
		} else if (type === 'recovery' && token) {
			// Handle old token format
			console.log('Password reset flow with token (old format):', { type, hasToken: !!token });
			setAuthView('update_password');
			setIsRecoveryFlow(true);
		}
	}, [searchParams, supabase]);

	// Listen for auth state changes to handle password recovery and redirect after update
	useEffect(() => {
		if (!supabase) return;

		const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
			console.log('Auth state changed:', { event, hasSession: !!session, isRecoveryFlow, authView });
			
			// When password recovery is detected, ensure we're on update_password view
			if (event === 'PASSWORD_RECOVERY') {
				console.log('PASSWORD_RECOVERY event detected');
				setAuthView('update_password');
				setIsRecoveryFlow(true);
			}
			
			// After password is successfully updated, redirect to dashboard
			// Only redirect if we were in a recovery flow and now have a session
			if (event === 'SIGNED_IN' && session && isRecoveryFlow && authView === 'update_password') {
				console.log('Password updated successfully, redirecting to dashboard');
				// Clear recovery flow flag and redirect
				setIsRecoveryFlow(false);
				setAuthView('sign_in');
				// Clear URL parameters
				router.replace('/dashboard');
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [supabase, isRecoveryFlow, authView, router]);

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
								message: '!bg-surface !border-2 !border-edge !text-text !font-semibold !rounded-xl2 !p-4 !shadow-lg !opacity-100',
							},
						}}
					/>
				</div>
			</motion.section>
			<p className="mt-6 text-center text-xs text-text-dim">By continuing you agree to our Terms & Privacy.</p>
		</div>
	);
}

