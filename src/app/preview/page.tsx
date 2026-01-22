import { Suspense } from "react";
import PreviewClient from "./PreviewClient";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100">
          <div className="mx-auto w-full max-w-4xl px-6 py-10">
            <div className="rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
              <p className="mt-4 text-sm text-neutral-300">
                Building your content system. This usually takes under 10 seconds.
              </p>
            </div>
          </div>
        </main>
      }
    >
      <PreviewClient />
    </Suspense>
  );
}
