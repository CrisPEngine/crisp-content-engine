'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function ForgotPasswordClient() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect_to');
  const redirectParam = redirectTo && redirectTo.startsWith('/') ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <div className="mx-auto w-full max-w-md px-6">
          <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-neutral-300">
              We&apos;ve sent a password reset link to <strong className="text-neutral-100">{email}</strong>.
              Click the link in that email to set a new password.
            </p>
            <p className="mt-4 text-sm text-neutral-400">
              The link expires in 1 hour. If you don&apos;t see the email, check your spam folder.
            </p>
            <Link
              href={`/sign-in${redirectParam}`}
              className="mt-6 inline-block text-sm font-medium text-sky-400 hover:text-sky-300"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
            <button
              type="submit"
              className="w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <p className="mt-4 text-center text-sm text-neutral-400">
            <Link href={`/sign-in${redirectParam}`} className="font-medium text-sky-400 hover:text-sky-300">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
