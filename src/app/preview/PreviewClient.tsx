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

// Defensive schema validation
function validateAndSanitizeOutput(data: any): PreviewOutput | null {
  if (!data || typeof data !== 'object') return null;
  
  const packTitle = typeof data.packTitle === 'string' ? data.packTitle.trim() : '';
  if (!packTitle) return null;

  if (!Array.isArray(data.sections) || data.sections.length !== 3) return null;

  const sections = data.sections
    .map((section: any) => {
      if (!section || typeof section !== 'object') return null;
      const name = typeof section.name === 'string' ? section.name.trim() : '';
      if (!name) return null;

      if (!Array.isArray(section.posts) || section.posts.length !== 3) return null;

      const posts = section.posts
        .map((post: any) => {
          if (!post || typeof post !== 'object') return null;
          const title = typeof post.title === 'string' ? post.title.trim() : '';
          const body = typeof post.body === 'string' ? post.body.trim() : '';
          if (!title || !body) return null;

          if (!Array.isArray(post.hooks) || post.hooks.length !== 2) return null;
          const hooks = post.hooks
            .map((hook: any) => typeof hook === 'string' ? hook.trim() : '')
            .filter((h: string) => h.length > 0);
          if (hooks.length !== 2) return null;

          return { title, body, hooks: [hooks[0], hooks[1]] as [string, string] };
        })
        .filter((p: any): p is NonNullable<typeof p> => p !== null);

      if (posts.length !== 3) return null;
      return { name, posts };
    })
    .filter((s: any): s is NonNullable<typeof s> => s !== null);

  if (sections.length !== 3) return null;
  return { packTitle, sections };
}

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
  const [loadingText, setLoadingText] = useState("Generating your content pack. This takes ~30 seconds.");
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<PreviewOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState(0);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [gateActive, setGateActive] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const gateSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Check if we should start polling or if already generated
      fetchPreviewOutputs(sessionId);
    }
  }, [searchParams, previewSessionId]);

  // Gate activation: trigger after scroll past first post OR 10 seconds, whichever comes first
  useEffect(() => {
    if (!outputs) return;

    // Set 10-second timer
    gateTimerRef.current = setTimeout(() => {
      setGateActive(true);
    }, 10000);

    // Set up scroll observer for sentinel (after first post)
    if (gateSentinelRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setGateActive(true);
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(gateSentinelRef.current);
      return () => {
        observer.disconnect();
        if (gateTimerRef.current) {
          clearTimeout(gateTimerRef.current);
        }
      };
    }

    return () => {
      if (gateTimerRef.current) {
        clearTimeout(gateTimerRef.current);
      }
    };
  }, [outputs]);

  useEffect(() => {
    if (isLoading) {
      setLoadingText("Generating your content pack. This takes ~30 seconds.");
      loadingTimeoutRef.current = setTimeout(() => {
        setLoadingText("Still working. Finalising output.");
      }, 25000);
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    }
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [isLoading]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  async function pollPreviewStatus(sessionId: string) {
    const startTime = Date.now();
    const maxPollTime = 60000; // 60 seconds max
    setPollStartTime(startTime);

    const poll = async () => {
      try {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxPollTime) {
          // Timeout
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          setIsLoading(false);
          setError("Generation timed out. Please try again.");
          console.error('[preview_failed]', { error: 'Polling timeout', previewSessionId: sessionId });
          return;
        }

        const res = await fetch(`/api/preview/status?previewSessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();

        if (!res.ok) {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          setIsLoading(false);
          setError(data?.error || "Failed to check preview status. Please try again.");
          console.error('[preview_failed]', { error: data?.error, previewSessionId: sessionId });
          return;
        }

        if (data.status === 'generated' && data.outputs) {
          // Success - stop polling
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          setIsLoading(false);
          setPollStartTime(null);

          const sanitized = validateAndSanitizeOutput(data.outputs);
          if (!sanitized) {
            console.error('[preview_failed]', { error: 'Invalid output schema', previewSessionId: sessionId });
            setError("Invalid content format. Please try again.");
            return;
          }

          setOutputs(sanitized);
          console.log('[preview_generated]', { previewSessionId: sessionId });
        } else if (data.status === 'failed') {
          // Failed - stop polling
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          setIsLoading(false);
          setPollStartTime(null);
          setError(data?.error || "Generation failed. Please try again.");
          console.error('[preview_failed]', { error: data?.error, previewSessionId: sessionId });
        }
        // If status is 'processing' or 'generating', continue polling
      } catch (err: any) {
        // On error, continue polling unless we've timed out
        const elapsed = Date.now() - startTime;
        if (elapsed > maxPollTime) {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          setIsLoading(false);
          setPollStartTime(null);
          setError("Network error while checking status. Please try again.");
          console.error('[preview_failed]', { error: err?.message || 'Network error', previewSessionId: sessionId });
        }
      }
    };

    // Poll immediately, then every 1 second
    poll();
    const interval = setInterval(poll, 1000);
    setPollingInterval(interval);
  }

  async function fetchPreviewOutputs(sessionId: string) {
    try {
      setIsLoading(true);
      setError(null);
      console.log('[preview_started]', { previewSessionId: sessionId });

      // First check current status
      const statusRes = await fetch(`/api/preview/status?previewSessionId=${encodeURIComponent(sessionId)}`);
      const statusData = await statusRes.json();

      if (!statusRes.ok) {
        setError(statusData?.error || "Failed to check preview status. Please try again.");
        setIsLoading(false);
        return;
      }

      if (statusData.status === 'generated' && statusData.outputs) {
        // Already generated
        setIsLoading(false);
        const sanitized = validateAndSanitizeOutput(statusData.outputs);
        if (sanitized) {
          setOutputs(sanitized);
          console.log('[preview_generated]', { previewSessionId: sessionId });
        } else {
          setError("Invalid content format. Please try again.");
        }
      } else if (statusData.status === 'failed') {
        // Failed
        setIsLoading(false);
        setError(statusData?.error || "Generation failed. Please try again.");
        console.error('[preview_failed]', { error: statusData?.error, previewSessionId: sessionId });
      } else {
        // Generating - start polling
        // Also trigger generation if status is 'created'
        if (statusData.status === 'created') {
          const generateRes = await fetch("/api/preview/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ previewSessionId: sessionId }),
          });
          // Don't wait for response, just start polling
        }
        await pollPreviewStatus(sessionId);
      }
    } catch (err: any) {
      console.error('[preview_failed]', { error: err?.message || 'Network error', previewSessionId: sessionId });
      setError(err?.message || "Network error. Please try again.");
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
    if (!canGenerate || isLoading) return;
    setError(null);

    try {
      setIsLoading(true);
      console.log('[preview_started]', { persona, tone, goal });

      // Step 1: Create preview session
      const createRes = await fetch("/api/preview/create", {
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

      let createData: any;
      try {
        createData = await createRes.json();
      } catch (parseError) {
        console.error('[preview_failed]', { error: 'Invalid JSON response' });
        setError("Invalid response from server. Please try again.");
        setIsLoading(false);
        return;
      }

      if (!createRes.ok) {
        const errorMessage = createData?.error || createData?.message || "Failed to start preview";
        console.error('[preview_failed]', { error: errorMessage });
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      const sessionId = createData.previewSessionId as string;
      if (!sessionId) {
        console.error('[preview_failed]', { error: 'Missing previewSessionId' });
        setError("Invalid response. Please try again.");
        setIsLoading(false);
        return;
      }

      setPreviewSessionId(sessionId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("preview_session_id", sessionId);
      router.replace(`/preview?${params.toString()}`);

      // Step 2: Trigger generation (fire-and-forget)
      const generateRes = await fetch("/api/preview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewSessionId: sessionId }),
      });

      let generateData: any;
      try {
        generateData = await generateRes.json();
      } catch (parseError) {
        console.error('[preview_failed]', { error: 'Invalid JSON response from generate' });
        setError("Invalid response from server. Please try again.");
        setIsLoading(false);
        return;
      }

      if (generateRes.status === 202 || generateData.status === 'generating') {
        // Successfully started processing, now poll for status
        await pollPreviewStatus(sessionId);
      } else if (generateRes.status === 200 && generateData.status === 'generated' && generateData.outputs) {
        // Already generated (cached)
        setIsLoading(false);
        const sanitized = validateAndSanitizeOutput(generateData.outputs);
        if (sanitized) {
          setOutputs(sanitized);
          console.log('[preview_generated]', { previewSessionId: sessionId });
        } else {
          setError("Invalid content format. Please try again.");
        }
      } else {
        // Error
        const errorMessage = generateData?.error || generateData?.message || "Failed to start generation";
        console.error('[preview_failed]', { error: errorMessage });
        setError(errorMessage);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('[preview_failed]', { error: err?.message || 'Network error' });
      setError(err?.message || "Network error. Please try again.");
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
    if (!previewSessionId || isConverting) return;
    
    try {
      setIsConverting(true);
      console.log('[preview_convert_clicked]', { previewSessionId });

      const res = await fetch("/api/preview/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewSessionId }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch (parseError) {
        console.error('[preview_failed]', { error: 'Invalid JSON response', previewSessionId });
        setError("Invalid response from server. Please try again.");
        return;
      }

      if (res.status === 401) {
        const returnTo = encodeURIComponent(`/preview?preview_session_id=${previewSessionId}`);
        window.location.href = `/sign-in?redirect_to=${returnTo}`;
        return;
      }

      if (!res.ok) {
        const errorMessage = data?.error || data?.message || "Conversion failed";
        console.error('[preview_failed]', { error: errorMessage, previewSessionId });
        setError(errorMessage);
        return;
      }

      if (data.redirectUrl) {
        console.log('[preview_converted_success]', { previewSessionId, redirectUrl: data.redirectUrl });
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      console.error('[preview_failed]', { error: err?.message || 'Network error', previewSessionId });
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setIsConverting(false);
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

          <div className={`mt-6 space-y-6 ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-400">Persona</div>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPersona(option)}
                    disabled={isLoading}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      persona === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
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
                    disabled={isLoading}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      selectedTopics.includes(option)
                        ? "bg-neutral-100 text-neutral-950 ring-neutral-100"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <input
                value={otherTopic}
                onChange={(event) => setOtherTopic(event.target.value)}
                placeholder="Other"
                disabled={isLoading}
                className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isLoading}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      tone === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
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
                    disabled={isLoading}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ring-1 ${
                      goal === option
                        ? "bg-sky-400 text-neutral-950 ring-sky-300"
                        : "bg-neutral-900 text-neutral-100 ring-neutral-800 hover:bg-neutral-800"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="mt-6 w-full rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleGenerate}
            disabled={isLoading || !canGenerate}
          >
            Generate my content pack
          </button>

          {error && (
            <div className="mt-4 rounded-xl bg-red-950/20 border border-red-800/50 p-4">
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  if (previewSessionId) {
                    fetchPreviewOutputs(previewSessionId);
                  } else {
                    handleGenerate();
                  }
                }}
                className="mt-3 rounded-full bg-red-900/50 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/70"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="mt-8 rounded-2xl bg-neutral-950/40 p-6 ring-1 ring-neutral-800 backdrop-blur text-center">
            <p className="text-sm text-neutral-300">{loadingText}</p>
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

            <div className="mt-6 space-y-6 relative">
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
                        const isFirstPost = currentIndex === 0;
                        const showSentinel = !sentinelPlaced && currentIndex === 1; // After first post
                        if (showSentinel) {
                          sentinelPlaced = true;
                        }
                        const isGated = gateActive && !isFirstPost;
                        return (
                          <article
                            key={postId}
                            className={`rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800 relative ${isGated ? 'opacity-30' : ''}`}
                          >
                            {showSentinel && <div ref={gateSentinelRef} className="absolute -top-4 left-0 right-0 h-1" />}
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-sm font-semibold text-neutral-100">
                                {post.title}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(`${post.title}\n\n${post.body}`, postId)}
                                disabled={(gateActive && !isFirstPost) || copyCount >= 2}
                                className="text-xs font-semibold text-sky-300 hover:text-sky-200 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {copiedPostId === postId ? "Copied" : "Copy"}
                              </button>
                            </div>

                            <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
                              {post.body.split("\n").map((line, idx) => (
                                <p key={`${postId}-line-${idx}`}>{line || '\u00A0'}</p>
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

              {/* Gate overlay - only covers posts after the first one */}
              {gateActive && (
                <>
                  {/* Blurred fade overlay starting after first post */}
                  <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
                    {/* Calculate approximate height of first post section - use a reasonable offset */}
                    <div 
                      className="absolute left-0 right-0 bg-gradient-to-b from-transparent via-neutral-950/60 to-neutral-950/95 backdrop-blur-sm"
                      style={{ top: '20%', bottom: 0 }}
                    />
                  </div>
                  
                  {/* Unlock banner - positioned to be visible */}
                  <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-auto z-10">
                    <div className="max-w-md mx-4 rounded-2xl bg-neutral-950/95 backdrop-blur border border-neutral-800 p-6 space-y-4 text-center shadow-2xl">
                      <h3 className="text-xl font-semibold">Unlock your full content system</h3>
                      <p className="text-sm text-neutral-300">
                        You can read the first post. Unlock to save all posts to your workspace.
                      </p>
                      <ul className="space-y-2 text-sm text-neutral-400">
                        <li>Save all 9 posts to your workspace</li>
                        <li>Edit and approve inside CRISP</li>
                        <li>Schedule with Buffer when ready</li>
                      </ul>
                      <div className="flex flex-wrap justify-center gap-3 pt-2">
                        <button
                          onClick={handleConvert}
                          disabled={isConverting}
                          className="rounded-full bg-sky-400 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isConverting ? "Processing..." : "Unlock and save posts"}
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
                </>
              )}
            </div>
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
