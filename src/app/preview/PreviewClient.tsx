'use client';

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PreviewOutput = {
  packTitle: string;
  sections: Array<{
    name: string;
    posts: Array<{
      title: string;
      body: string;
      hooks: [string, string];
    }>;
  }>;
};

const PERSONAS = ["Founder", "Consultant", "Agency", "Local business", "Ecommerce brand"] as const;
const TOPICS = [
  "Positioning",
  "Lead generation",
  "Founder insights",
  "Customer stories",
  "Industry trends",
  "Product lessons",
  "Operations and systems",
  "Sales conversations",
  "Brand trust",
] as const;
const TONES = ["Direct", "Thoughtful", "Bold", "Practical"] as const;
const GOALS = ["Awareness", "Leads", "Trust", "Sales"] as const;
const PLATFORMS = ["LinkedIn", "X", "Instagram"] as const;

export default function PreviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [persona, setPersona] = useState<string>("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [otherTopic, setOtherTopic] = useState("");
  const [tone, setTone] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("LinkedIn");
  const [isLoading, setIsLoading] = useState(false);
  const [outputs, setOutputs] = useState<PreviewOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState(0);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [gateActive, setGateActive] = useState(false);
  const gateSentinelRef = useRef<HTMLDivElement | null>(null);

  const utmSource = searchParams.get("utm_source");
  const utmCampaign = searchParams.get("utm_campaign");

  const topicsPayload = useMemo(
    () => ({
      selected: selectedTopics,
      other: otherTopic.trim() ? otherTopic.trim() : null,
    }),
    [selectedTopics, otherTopic]
  );

  useEffect(() => {
    const sessionId = searchParams.get("preview_session_id");
    if (sessionId && sessionId !== previewSessionId) {
      setPreviewSessionId(sessionId);
      fetchPreviewOutputs(sessionId);
    }
  }, [searchParams, previewSessionId]);

  useEffect(() => {
    if (!outputs || !gateSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setGateActive(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(gateSentinelRef.current);
    return () => observer.disconnect();
  }, [outputs]);

  async function fetchPreviewOutputs(sessionId: string) {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/preview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewSessionId: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate preview");
      }
      setOutputs(data.outputs);
    } catch (err: any) {
      setError(err?.message || "Failed to generate preview");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleTopic(topic: string) {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter((item) => item !== topic));
      return;
    }
    if (selectedTopics.length >= 3) return;
    setSelectedTopics([...selectedTopics, topic]);
  }

  const canGenerate =
    persona.length > 0 &&
    (selectedTopics.length > 0 || otherTopic.trim().length > 0) &&
    tone.length > 0 &&
    goal.length > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setError(null);

    try {
      setIsLoading(true);
      const res = await fetch("/api/preview/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          topics: topicsPayload,
          tone,
          goal,
          utm_source: utmSource,
          utm_campaign: utmCampaign,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to start preview");
      }
      const sessionId = data.previewSessionId as string;
      setPreviewSessionId(sessionId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("preview_session_id", sessionId);
      router.replace(`/preview?${params.toString()}`);
      await fetchPreviewOutputs(sessionId);
    } catch (err: any) {
      setError(err?.message || "Failed to start preview");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(content: string, postId: string) {
    if (gateActive || copyCount >= 2) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedPostId(postId);
      setTimeout(() => setCopiedPostId(null), 1200);
      const nextCount = copyCount + 1;
      setCopyCount(nextCount);
      if (nextCount >= 2) {
        setGateActive(true);
      }
    } catch (err) {
      setError("Copy failed. Please try again.");
    }
  }

  async function handleConvert() {
    if (!previewSessionId) return;
    try {
      const res = await fetch("/api/preview/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewSessionId }),
      });
      const data = await res.json();
      if (res.status === 401) {
        const returnTo = encodeURIComponent(`/preview?preview_session_id=${previewSessionId}`);
        window.location.href = `/sign-in?redirect_to=${returnTo}`;
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error || "Conversion failed");
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      setError(err?.message || "Conversion failed");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-neutral-300 hover:text-neutral-200">
            Back
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-900"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-10 rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
          <h1 className="text-2xl font-semibold">Instant preview</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Answer a few questions. Get a 9-post content system.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StepCard title="1. Persona" desc="Founder, consultant, agency and more" />
            <StepCard title="2. Topics" desc="Pick up to 3 core themes" />
            <StepCard title="3. Tone + goal" desc="Direct, bold, practical. Leads, trust, sales" />
          </div>

          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-400">Persona</div>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPersona(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      persona === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-400">Topics</div>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleTopic(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      selectedTopics.includes(option)
                        ? "bg-neutral-100 text-neutral-950 ring-neutral-100"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <input
                value={otherTopic}
                onChange={(event) => setOtherTopic(event.target.value)}
                placeholder="Other"
                className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-400">Tone</div>
              <div className="flex flex-wrap gap-2">
                {TONES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTone(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      tone === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-400">Goal</div>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGoal(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      goal === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="mt-6 w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60"
            onClick={handleGenerate}
            disabled={isLoading || !canGenerate}
          >
            Generate my content pack
          </button>

          <p className="mt-3 text-xs text-neutral-500">
            Wire this page to /api/preview/create and /api/preview/generate then render outputs with gating.
          </p>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        {isLoading && (
          <div className="mt-8 rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
            <p className="mt-4 text-sm text-neutral-300">
              Building your content system. This usually takes under 10 seconds.
            </p>
          </div>
        )}

        {outputs && (
          <div className="relative mt-8 rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase text-neutral-500">Total posts: 9</div>
                <div className="mt-1 text-lg font-semibold">{outputs.packTitle}</div>
              </div>
              <div className="flex items-center gap-2">
                {PLATFORMS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPlatform(option)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      platform === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-300 ring-neutral-800 hover:bg-neutral-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {(() => {
                let globalIndex = 0;
                let sentinelPlaced = false;
                return outputs.sections.map((section, sectionIndex) => (
                  <section key={section.name} className="space-y-3">
                    <h2 className="text-sm font-semibold text-neutral-200">{section.name}</h2>
                    <div className="space-y-4">
                      {section.posts.map((post, postIndex) => {
                        const postId = `${sectionIndex}-${postIndex}`;
                        const currentIndex = globalIndex;
                        globalIndex += 1;
                        const showSentinel = !sentinelPlaced && currentIndex === 2;
                        if (showSentinel) {
                          sentinelPlaced = true;
                        }
                        return (
                          <article
                            key={postId}
                            className="rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800"
                          >
                            {showSentinel && <div ref={gateSentinelRef} className="h-0" />}
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-sm font-semibold text-neutral-100">
                                {post.title}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(`${post.title}\n\n${post.body}`, postId)}
                                disabled={gateActive || copyCount >= 2}
                                className="text-xs font-semibold text-sky-300 hover:text-sky-200 disabled:opacity-40"
                              >
                                {copiedPostId === postId ? "Copied" : "Copy"}
                              </button>
                            </div>

                            <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
                              {post.body.split("\n").map((line, idx) => (
                                <p key={`${postId}-line-${idx}`}>{line}</p>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                              {post.hooks.map((hook, hookIndex) => (
                                <span
                                  key={`${postId}-hook-${hookIndex}`}
                                  className="rounded-full bg-neutral-900 px-3 py-1 ring-1 ring-neutral-800"
                                >
                                  {hook}
                                </span>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ));
              })()}
            </div>

            {gateActive && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-neutral-950/90 backdrop-blur">
                <div className="max-w-md space-y-4 text-center">
                  <h3 className="text-xl font-semibold">Unlock your full content system</h3>
                  <ul className="space-y-2 text-sm text-neutral-300">
                    <li>Save all 9 posts to your workspace</li>
                    <li>Edit and approve inside CRISP</li>
                    <li>Schedule with Buffer when ready</li>
                  </ul>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={handleConvert}
                      className="rounded-full bg-sky-400 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
                    >
                      Unlock and save posts
                    </button>
                    <Link
                      href={`/sign-in?redirect_to=${encodeURIComponent(`/preview?preview_session_id=${previewSessionId || ""}`)}`}
                      className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-900"
                    >
                      Sign in to continue
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StepCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-neutral-300">{desc}</div>
    </div>
  );
}
