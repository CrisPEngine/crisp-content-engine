'use client';

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSupabase } from "@/components/SupabaseProvider";
import { getSupabaseService } from "@/lib/supabaseService";

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

// Channel formatting functions
type FormattedPost = {
  title: string;
  body: string;
  hooks: [string, string];
};

function formatPostForChannel(post: { title: string; body: string; hooks: [string, string] }, channel: typeof PLATFORMS[number]): FormattedPost {
  if (channel === 'LinkedIn') {
    // LinkedIn: as-is, keep paragraphs
    return {
      title: post.title,
      body: post.body,
      hooks: post.hooks,
    };
  } else if (channel === 'X') {
    // X: truncate to 280 chars, prioritize hook + key point + CTA
    const hook = post.hooks[0] || post.title;
    const bodyLines = post.body.split('\n').filter(line => line.trim().length > 0);
    const firstKeyPoint = bodyLines[0] || '';
    const cta = bodyLines[bodyLines.length - 1] || '';
    
    // Build X post: hook + first key point + CTA
    let xPost = `${hook}\n\n${firstKeyPoint}`;
    if (cta && cta !== firstKeyPoint) {
      xPost += `\n\n${cta}`;
    }
    
    // Hard limit 280 chars
    if (xPost.length > 280) {
      // Prioritize hook, then truncate
      const hookLength = hook.length;
      const remaining = 280 - hookLength - 3; // 3 for "\n\n"
      if (remaining > 0) {
        xPost = `${hook}\n\n${firstKeyPoint.substring(0, remaining)}`;
      } else {
        xPost = hook.substring(0, 280);
      }
    }
    
    return {
      title: post.title,
      body: xPost,
      hooks: [hook.substring(0, 50), post.hooks[1]?.substring(0, 50) || hook.substring(0, 50)],
    };
  } else {
    // Instagram: 1-2 short paragraphs + optional CTA
    const bodyLines = post.body.split('\n').filter(line => line.trim().length > 0);
    const firstParagraph = bodyLines[0] || '';
    const secondParagraph = bodyLines[1] || '';
    const cta = bodyLines[bodyLines.length - 1] || '';
    
    let instagramBody = firstParagraph;
    if (secondParagraph && secondParagraph !== cta) {
      instagramBody += `\n\n${secondParagraph}`;
    }
    if (cta && cta !== firstParagraph && cta !== secondParagraph) {
      instagramBody += `\n\n${cta}`;
    }
    
    return {
      title: post.title,
      body: instagramBody,
      hooks: post.hooks,
    };
  }
}

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
  const supabase = useSupabase();
  const [persona, setPersona] = useState<string>("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [otherTopic, setOtherTopic] = useState("");
  const [tone, setTone] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("LinkedIn");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Generating your content pack. This takes ~30 seconds.");
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<PreviewOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState(0);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [gateActive, setGateActive] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [previewPackId, setPreviewPackId] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [loadingBrands, setLoadingBrands] = useState(false);
  const gateSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utmSource = searchParams.get("utm_source");
  const utmCampaign = searchParams.get("utm_campaign");
  const urlPreviewPackId = searchParams.get("preview_pack_id");

  // Check authentication status
  useEffect(() => {
    if (!supabase) {
      setIsAuthenticated(false);
      return;
    }
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthenticated(!!user);
      } catch (err) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const topicsPayload = useMemo(
    () => ({
      selected: selectedTopics,
      other: otherTopic.trim() ? otherTopic.trim() : null,
    }),
    [selectedTopics, otherTopic]
  );

  // Load from preview_packs if pack ID is in URL
  useEffect(() => {
    if (urlPreviewPackId && isAuthenticated === true && supabase) {
      loadPreviewPack(urlPreviewPackId);
    }
  }, [urlPreviewPackId, isAuthenticated, supabase]);

  async function loadPreviewPack(packId: string) {
    try {
      setIsLoading(true);
      setError(null);
      setPreviewPackId(packId);
      
      const admin = getSupabaseService();
      const { data: pack, error: packError } = await admin
        .from('preview_packs')
        .select('*')
        .eq('id', packId)
        .maybeSingle();

      if (packError || !pack) {
        setError('Preview pack not found');
        setIsLoading(false);
        return;
      }

      if (pack.outputs) {
        const sanitized = validateAndSanitizeOutput(pack.outputs);
        if (sanitized) {
          setOutputs(sanitized);
          setPersona(pack.persona || '');
          setTone(pack.tone || '');
          setGoal(pack.goal || '');
          setPlatform((pack.channel as typeof PLATFORMS[number]) || 'LinkedIn');
          if (pack.topics && typeof pack.topics === 'object') {
            const topicsObj = pack.topics as any;
            if (Array.isArray(topicsObj.selected)) {
              setSelectedTopics(topicsObj.selected);
            }
            if (topicsObj.other) {
              setOtherTopic(topicsObj.other);
            }
          }
          setIsUnlocked(true); // Already generated, show all
        } else {
          setError('Invalid preview data format');
        }
      } else {
        setError('Preview pack has no outputs');
      }
    } catch (err: any) {
      console.error('Failed to load preview pack:', err);
      setError(err.message || 'Failed to load preview pack');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const sessionId = searchParams.get("preview_session_id");
    if (sessionId && sessionId !== previewSessionId && !urlPreviewPackId) {
      setPreviewSessionId(sessionId);
      // Check if we should start polling or if already generated
      fetchPreviewOutputs(sessionId);
    }
  }, [searchParams, previewSessionId, urlPreviewPackId]);

  // Gate activation: trigger after scroll past first post OR 10 seconds, whichever comes first
  // But only if not unlocked
  useEffect(() => {
    if (!outputs || isUnlocked) {
      if (gateTimerRef.current) {
        clearTimeout(gateTimerRef.current);
      }
      setGateActive(false);
      return;
    }

    // Set 30-second timer (give users time to read first post)
    gateTimerRef.current = setTimeout(() => {
      if (!isUnlocked) {
        setGateActive(true);
      }
    }, 30000);

    // Set up scroll observer for sentinel (after first post)
    if (gateSentinelRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting) && !isUnlocked) {
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
  }, [outputs, isUnlocked]);

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
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  function stopPolling() {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsLoading(false);
    setPollStartTime(null);
  }

  async function pollPreviewStatus(sessionId: string) {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const startTime = Date.now();
    const maxPollTime = 60000; // 60 seconds max
    setPollStartTime(startTime);

    const poll = async () => {
      try {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxPollTime) {
          // Timeout - stop polling
          stopPolling();
          setError("Generation timed out. Please try again.");
          console.error('[preview_failed]', { error: 'Polling timeout', previewSessionId: sessionId });
          return;
        }

        const res = await fetch(`/api/preview/status?previewSessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();

        if (!res.ok) {
          stopPolling();
          setError(data?.error || "Failed to check preview status. Please try again.");
          console.error('[preview_failed]', { error: data?.error, previewSessionId: sessionId });
          return;
        }

        if (data.status === 'generated' && data.outputs) {
          // Success - stop polling
          stopPolling();

          const sanitized = validateAndSanitizeOutput(data.outputs);
          if (!sanitized) {
            console.error('[preview_failed]', { error: 'Invalid output schema', previewSessionId: sessionId });
            setError("Invalid content format. Please try again.");
            return;
          }

          setOutputs(sanitized);
          console.log('[preview_generated]', { previewSessionId: sessionId });
        } else if (data.status === 'converted') {
          // Already converted - stop polling and redirect to approvals
          stopPolling();
          console.log('[preview_converted]', { previewSessionId: sessionId });
          // Redirect to content approval (the convert endpoint should have created the records)
          window.location.href = '/content/approval';
          return;
        } else if (data.status === 'failed') {
          // Failed - stop polling
          stopPolling();
          setError(data?.error || "Generation failed. Please try again.");
          console.error('[preview_failed]', { error: data?.error, previewSessionId: sessionId });
        }
        // If status is 'processing' or 'generating', continue polling
      } catch (err: any) {
        // On error, continue polling unless we've timed out
        const elapsed = Date.now() - startTime;
        if (elapsed > maxPollTime) {
          stopPolling();
          setError("Network error while checking status. Please try again.");
          console.error('[preview_failed]', { error: err?.message || 'Network error', previewSessionId: sessionId });
        }
      }
    };

    // Poll immediately, then every 1 second
    poll();
    pollingIntervalRef.current = setInterval(poll, 1000);
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
      } else if (statusData.status === 'converted') {
        // Already converted - stop polling, don't redirect (let convert endpoint handle redirect)
        setIsLoading(false);
        console.log('[preview_converted]', { previewSessionId: sessionId });
        // Don't redirect here - the convert endpoint will handle it
        return;
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

  async function handleCopy(post: { title: string; body: string; hooks: [string, string] }, postId: string, postIndex: number) {
    // Only allow copying first 3 posts (indices 0, 1, 2)
    if (postIndex >= 3 && !isUnlocked) return;
    if (copyCount >= 3 && !isUnlocked) return;
    
    const formatted = formatPostForChannel(post, platform);
    const content = `${formatted.title}\n\n${formatted.body}`;
    
    try {
      await navigator.clipboard.writeText(content);
      setCopiedPostId(postId);
      setTimeout(() => setCopiedPostId(null), 1200);
      if (!isUnlocked) {
        const nextCount = copyCount + 1;
        setCopyCount(nextCount);
        if (nextCount >= 3) {
          setGateActive(true);
        }
      }
    } catch (err) {
      setError("Copy failed. Please try again.");
    }
  }

  async function handleCopyAll() {
    if (!outputs || !isUnlocked) return;
    try {
      const allPosts = outputs.sections.flatMap(section => section.posts);
      const formattedPosts = allPosts.map(post => formatPostForChannel(post, platform));
      const allContent = formattedPosts.map((post, idx) => 
        `Post ${idx + 1}: ${post.title}\n\n${post.body}\n\n---\n\n`
      ).join('\n');
      await navigator.clipboard.writeText(allContent);
      setCopiedPostId('all');
      setTimeout(() => setCopiedPostId(null), 2000);
    } catch (err) {
      setError("Copy failed. Please try again.");
    }
  }

  async function loadBrands() {
    try {
      setLoadingBrands(true);
      const res = await fetch('/api/brands', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to load brands');
      }
      const data = await res.json();
      const brandList = (data.profiles || []).map((p: any) => ({
        id: p.id,
        name: p.client_name || p.name || 'Unnamed Brand',
      }));
      setBrands(brandList);
    } catch (err: any) {
      console.error('Failed to load brands:', err);
      setError(err.message || 'Failed to load brands');
    } finally {
      setLoadingBrands(false);
    }
  }

  async function handleUnlockClick() {
    if (!previewSessionId && !previewPackId) return;
    
    // Check if authenticated
    if (isAuthenticated === false) {
      // Show email form for anonymous users
      setShowEmailForm(true);
      return;
    }
    
    // If auth status unknown, check first
    if (isAuthenticated === null && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsAuthenticated(true);
          // User is authenticated, show brand selection
          await loadBrands();
          setShowBrandModal(true);
        } else {
          setIsAuthenticated(false);
          setShowEmailForm(true);
        }
      } catch (err) {
        setIsAuthenticated(false);
        setShowEmailForm(true);
      }
      return;
    }
    
    // Authenticated - show brand selection modal
    if (isAuthenticated === true) {
      await loadBrands();
      setShowBrandModal(true);
    }
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!previewSessionId || !email.trim() || isSubmittingLead) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsSubmittingLead(true);
      setError(null);
      console.log('[preview_lead_submit]', { previewSessionId, email });

      const res = await fetch("/api/preview/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewSessionId,
          email: email.trim(),
          persona,
          topics: topicsPayload,
          tone,
          goal,
          utm_source: utmSource,
          utm_campaign: utmCampaign,
          channel: platform,
        }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch (parseError) {
        console.error('[preview_failed]', { error: 'Invalid JSON response' });
        setError("Invalid response from server. Please try again.");
        return;
      }

      if (!res.ok) {
        const errorMessage = data?.error || data?.message || "Failed to save email";
        console.error('[preview_failed]', { error: errorMessage });
        setError(errorMessage);
        return;
      }

      // Success - unlock all posts
      console.log('[preview_lead_success]', { previewSessionId, email });
      setIsUnlocked(true);
      setGateActive(false);
      setShowEmailForm(false);
      setError(null);
    } catch (err: any) {
      console.error('[preview_failed]', { error: err?.message || 'Network error' });
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setIsSubmittingLead(false);
    }
  }

  async function handleConvert() {
    if (isConverting) return;
    if (!previewPackId && !previewSessionId) return;
    if (!selectedBrandId) {
      setError("Please select a brand");
      return;
    }
    
    try {
      setIsConverting(true);
      setError(null);
      console.log('[preview_convert_clicked]', { previewPackId, previewSessionId, brandId: selectedBrandId });

      // For logged-in users, use previewPackId
      if (previewPackId) {
        const res = await fetch("/api/preview/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            previewPackId,
            brandId: selectedBrandId,
          }),
        });

        let data: any;
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('[preview_failed]', { error: 'Invalid JSON response' });
          setError("Invalid response from server. Please try again.");
          return;
        }

        if (!res.ok) {
          const errorMessage = data?.error || data?.message || "Conversion failed";
          console.error('[preview_failed]', { error: errorMessage });
          setError(errorMessage);
          return;
        }

        if (data.redirectUrl) {
          console.log('[preview_converted_success]', { 
            previewPackId, 
            redirectUrl: data.redirectUrl, 
            createdCount: data.createdCount 
          });
          // Show success toast, then redirect
          window.location.href = data.redirectUrl;
        }
        return;
      }

      // Legacy: For anonymous users with previewSessionId (should not happen for logged-in)
      if (previewSessionId) {
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
        // Should not happen if we checked auth, but handle gracefully
        setIsAuthenticated(false);
        setShowEmailForm(true);
        return;
      }

      if (!res.ok) {
        const errorMessage = data?.error || data?.message || "Conversion failed";
        console.error('[preview_failed]', { error: errorMessage, previewSessionId });
        setError(errorMessage);
        return;
      }

        if (data.redirectUrl) {
          console.log('[preview_converted_success]', { previewSessionId, redirectUrl: data.redirectUrl, postCount: data.postCount });
          window.location.href = data.redirectUrl;
        }
      }
    } catch (err: any) {
      console.error('[preview_failed]', { error: err?.message || 'Network error' });
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setIsConverting(false);
      setShowBrandModal(false);
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
                        // Sentinel after second post (index 2) to trigger gate after first blurred post
                        const showSentinel = !sentinelPlaced && currentIndex === 2;
                        if (showSentinel) {
                          sentinelPlaced = true;
                        }
                        const isGated = gateActive && currentIndex > 0 && !isUnlocked; // Gate all posts after first (unless unlocked)
                        const canCopy = isUnlocked || currentIndex < 3; // First 3 posts can be copied
                        const formatted = formatPostForChannel(post, platform);
                        return (
                          <article
                            key={postId}
                            className={`rounded-xl bg-neutral-950 p-4 ring-1 ring-neutral-800 relative ${isGated ? 'opacity-30' : ''} ${isGated ? 'select-none' : ''}`}
                            style={isGated ? { userSelect: 'none', WebkitUserSelect: 'none' } : {}}
                          >
                            {showSentinel && <div ref={gateSentinelRef} className="absolute -top-4 left-0 right-0 h-1" />}
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-sm font-semibold text-neutral-100">
                                {formatted.title}
                              </div>
                              {canCopy && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(post, postId, currentIndex)}
                                  disabled={!isUnlocked && (currentIndex >= 3 || copyCount >= 3)}
                                  className="text-xs font-semibold text-sky-300 hover:text-sky-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {copiedPostId === postId ? "Copied" : "Copy"}
                                </button>
                              )}
                            </div>

                            <div className={`mt-3 space-y-2 text-sm leading-relaxed text-neutral-300 ${isGated ? 'select-none' : ''}`} style={isGated ? { userSelect: 'none', WebkitUserSelect: 'none' } : {}}>
                              {formatted.body.split("\n").map((line, idx) => (
                                <p key={`${postId}-line-${idx}`}>{line || '\u00A0'}</p>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                              {formatted.hooks.map((hook, hookIndex) => (
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

              {/* Copy all button and secondary CTA - shown when unlocked */}
              {isUnlocked && (
                <div className="mt-6 space-y-3">
                  <div className="flex justify-center">
                    <button
                      onClick={handleCopyAll}
                      className="rounded-full bg-sky-400 px-6 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
                    >
                      {copiedPostId === 'all' ? "All posts copied!" : "Copy all posts"}
                    </button>
                  </div>
                  {isAuthenticated === false && (
                    <div className="flex justify-center">
                      <Link
                        href="/sign-in"
                        className="rounded-full px-6 py-2.5 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-900"
                      >
                        Create account to edit and manage content
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Gate overlay - only covers posts after the first one */}
              {gateActive && !isUnlocked && (
                <>
                  {/* Blurred fade overlay starting after first post */}
                  <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
                    {/* Gradient starts after first post (approximately 25% down) */}
                    <div 
                      className="absolute left-0 right-0 bg-gradient-to-b from-transparent via-neutral-950/60 to-neutral-950/95 backdrop-blur-sm"
                      style={{ top: '25%', bottom: 0 }}
                    />
                  </div>
                  
                  {/* Unlock banner - positioned after first blurred post */}
                  <div className="absolute top-[30%] left-0 right-0 flex justify-center pointer-events-auto z-10">
                    <div className="max-w-md mx-4 rounded-2xl bg-neutral-950/95 backdrop-blur border border-neutral-800 p-6 space-y-4 text-center shadow-2xl">
                      <h3 className="text-xl font-semibold">Unlock your full content system</h3>
                      <p className="text-sm text-neutral-300">
                        You can read the first post. Unlock to access all posts.
                      </p>
                      
                      {showEmailForm ? (
                        <form onSubmit={handleLeadSubmit} className="space-y-4 pt-2">
                          <div>
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="Enter your email"
                              required
                              disabled={isSubmittingLead}
                              className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-100 ring-1 ring-neutral-800 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="submit"
                              disabled={isSubmittingLead || !email.trim()}
                              className="rounded-full bg-sky-400 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isSubmittingLead ? "Unlocking..." : "Unlock all posts"}
                            </button>
                            <Link
                              href={`/sign-in?redirect_to=${encodeURIComponent(`/preview?preview_session_id=${previewSessionId || ""}`)}`}
                              className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-900"
                            >
                              I already have an account
                            </Link>
                          </div>
                        </form>
                      ) : (
                        <>
                          <ul className="space-y-2 text-sm text-neutral-400">
                            <li>Access all 9 posts</li>
                            <li>Edit and approve inside CRISP</li>
                            <li>Schedule when ready</li>
                          </ul>
                          <div className="flex flex-col gap-2 pt-2">
                            <button
                              onClick={handleUnlockClick}
                              disabled={isConverting || isSubmittingLead}
                              className="rounded-full bg-sky-400 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isConverting ? "Processing..." : "Unlock and save posts"}
                            </button>
                            {isAuthenticated === false && (
                              <Link
                                href={`/sign-in?redirect_to=${encodeURIComponent(`/preview?preview_session_id=${previewSessionId || ""}`)}`}
                                className="rounded-full px-5 py-2 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-900"
                              >
                                I already have an account
                              </Link>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Brand Selection Modal */}
              {showBrandModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="max-w-md w-full mx-4 rounded-2xl bg-neutral-950 border border-neutral-800 p-6 space-y-4 shadow-2xl">
                    <h3 className="text-xl font-semibold">Choose brand</h3>
                    <p className="text-sm text-neutral-300">
                      Select a brand to save these posts to your workspace.
                    </p>
                    
                    {loadingBrands ? (
                      <div className="py-8 text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                        <p className="mt-2 text-sm text-neutral-400">Loading brands...</p>
                      </div>
                    ) : brands.length === 0 ? (
                      <div className="py-8 text-center space-y-4">
                        <p className="text-sm text-neutral-400">No brands found.</p>
                        <Link
                          href="/onboarding"
                          className="inline-block rounded-full bg-sky-400 px-6 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-sky-300"
                        >
                          Create a brand
                        </Link>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {brands.map((brand) => (
                            <button
                              key={brand.id}
                              onClick={() => setSelectedBrandId(brand.id)}
                              className={`w-full text-left rounded-xl p-3 ring-1 transition ${
                                selectedBrandId === brand.id
                                  ? 'bg-sky-400/20 ring-sky-300 text-sky-300'
                                  : 'bg-neutral-900 ring-neutral-800 text-neutral-100 hover:bg-neutral-800'
                              }`}
                            >
                              {brand.name}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => {
                              setShowBrandModal(false);
                              setSelectedBrandId("");
                            }}
                            className="flex-1 rounded-full px-5 py-2 text-sm font-semibold text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-900"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleConvert}
                            disabled={!selectedBrandId || isConverting}
                            className="flex-1 rounded-full bg-sky-400 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-sky-300 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isConverting ? "Saving..." : "Save to workspace"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
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
