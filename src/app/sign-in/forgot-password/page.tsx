import { Suspense } from 'react';
import ForgotPasswordClient from './ForgotPasswordClient';

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
          <div className="mx-auto w-full max-w-md px-6">
            <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
              <p className="mt-4 text-sm text-neutral-300">Loading...</p>
            </div>
          </div>
        </main>
      }
    >
      <ForgotPasswordClient />
    </Suspense>
  );
}
