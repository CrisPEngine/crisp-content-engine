'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';

// Meta (Facebook) auth removed: publishing uses a separate Meta app; avoid mixing auth with app approvals.
type OAuthProvider = 'google' | 'linkedin_oidc';

export default function SignInClient() {
  const supabase = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = searchParams.get('redirect_to');
  const isSignUp = searchParams.get('signup') === 'true';
  const safeRedirectTo = redirectTo && redirectTo.startsWith('/') ? redirectTo : null;
  const authCallbackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback${safeRedirectTo ? `?redirect_to=${encodeURIComponent(safeRedirectTo)}` : ''}`
      : `https://app.crispdigital.io/auth/callback${safeRedirectTo ? `?redirect_to=${encodeURIComponent(safeRedirectTo)}` : ''}`;

  useEffect(() => {
    if (!supabase) return;
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (safeRedirectTo === '/connections') {
          router.replace('/connections?reauth=true');
          return;
        }
        router.replace(safeRedirectTo || '/dashboard');
      }
    };
    checkSession();
  }, [supabase, router, safeRedirectTo]);

  async function handleOAuth(provider: OAuthProvider) {
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authCallbackUrl,
        },
      });
    } catch (err: any) {
      setError(err?.message || (isSignUp ? 'Registration failed' : 'Sign in failed'));
      setLoading(false);
    }
  }

  async function handleEmailSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      const destination = safeRedirectTo === '/connections' ? '/connections?reauth=true' : safeRedirectTo;
      router.replace(destination || '/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
      setLoading(false);
    }
  }

  async function handleEmailSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authCallbackUrl },
      });
      if (signUpError) throw signUpError;
      const destination = safeRedirectTo === '/connections' ? '/connections?reauth=true' : safeRedirectTo;
      router.replace(destination || '/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
      setLoading(false);
    }
  }

  const loadingMessage = isSignUp ? 'Creating your account...' : 'Signing you in...';

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
          <p className="text-sm text-neutral-300">{loadingMessage}</p>
          <p className="text-xs text-neutral-500">Please wait.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
          {isSignUp ? (
            <>
              <h1 className="text-xl font-semibold">Start free</h1>
              <p className="mt-2 text-sm text-neutral-300">
                Create your account and get started. Secure and private.
              </p>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={loading}
                  className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 disabled:opacity-60"
                >
                  Sign up with Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('linkedin_oidc')}
                  disabled={loading}
                  className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 disabled:opacity-60"
                >
                  Sign up with LinkedIn
                </button>
              </div>

              <div className="my-6 h-px bg-neutral-900" />

              <form className="space-y-4" onSubmit={handleEmailSignUp}>
                <div>
                  <label className="text-xs text-neutral-400">Email address</label>
                  <input
                    type="email"
                    className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Password</label>
                  <input
                    type="password"
                    className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder="Choose a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
                  disabled={loading}
                >
                  Register
                </button>
                <p className="text-center text-sm text-neutral-500">No credit card required.</p>
              </form>
              <p className="mt-4 text-center text-sm text-neutral-400">
                Already have an account?{' '}
                <Link href="/sign-in" className="font-medium text-sky-400 hover:text-sky-300">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Sign in</h1>
              <p className="mt-2 text-sm text-neutral-300">
                Access your content workspace. Secure and private.
              </p>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={loading}
                  className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 disabled:opacity-60"
                >
                  Sign in with Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('linkedin_oidc')}
                  disabled={loading}
                  className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 disabled:opacity-60"
                >
                  Sign in with LinkedIn
                </button>
              </div>

              <div className="my-6 h-px bg-neutral-900" />

              <form className="space-y-4" onSubmit={handleEmailSignIn}>
                <div>
                  <label className="text-xs text-neutral-400">Email address</label>
                  <input
                    type="email"
                    className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Password</label>
                  <input
                    type="password"
                    className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
                  disabled={loading}
                >
                  Sign in
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-neutral-400">
                Don&apos;t have an account?{' '}
                <Link href="/sign-in?signup=true" className="font-medium text-sky-400 hover:text-sky-300">
                  Start free
                </Link>
              </p>
            </>
          )}

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  );
}
