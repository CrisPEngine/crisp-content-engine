'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/components/SupabaseProvider';

export default function SignInClient() {
  const supabase = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = searchParams.get('redirect_to');
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

  async function handleOAuth(provider: 'google' | 'linkedin_oidc') {
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
      setError(err?.message || 'Sign in failed');
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
      if (signInError) {
        throw signInError;
      }
      const destination = safeRedirectTo === '/connections' ? '/connections?reauth=true' : safeRedirectTo;
      router.replace(destination || '/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Access your content workspace. Secure and private.
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 disabled:opacity-60"
            >
              Sign in with Google
            </button>
            <button
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
                onChange={(event) => setEmail(event.target.value)}
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
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <button
              className="w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
              disabled={loading}
            >
              Sign in
            </button>
          </form>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  );
}
