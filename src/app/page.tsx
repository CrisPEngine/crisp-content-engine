"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Hero Section */}
      <section className="relative mt-16 lg:mt-20">
        <AnimatedBackground />
        
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12 2xl:max-w-[1400px]">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-16">
            {/* Left: Hero content */}
            <div className="lg:col-span-7">
              <HeroContent />
            </div>
            
            {/* Right: Hero Image */}
            <div className="lg:col-span-5 lg:justify-self-end">
              <HeroImage />
            </div>
          </div>
        </div>
      </section>

      {/* Value Blocks */}
      <section className="mt-32 lg:mt-40">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12">
          <ValueBlocks />
        </div>
      </section>

      {/* Conversion Band */}
      <section className="mt-32 lg:mt-40">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12">
          <ConversionBand />
        </div>
      </section>

      {/* Free Tier Section */}
      <section className="mt-32 lg:mt-40">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12">
          <FreeTierSection />
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12">
        <FooterNote />
      </div>
    </main>
  );
}

function HeroContent() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative z-10 max-w-2xl">
      <motion.h1 
        className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl leading-[1.1]"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        Build consistent visibility without burning out.
      </motion.h1>

      <motion.p 
        className="mt-4 max-w-xl text-pretty text-lg leading-relaxed text-neutral-300 sm:text-xl"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        CRISP turns your ideas into a structured content system.
        <br />
        <span className="text-neutral-400">Free to start. No credit card required.</span>
      </motion.p>

      <motion.div 
        className="mt-6 flex flex-wrap items-center gap-4"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <Link
          href="/sign-in?signup=true"
          className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold bg-sky-400 text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all shadow-lg shadow-sky-400/25 hover:shadow-xl hover:shadow-sky-400/30"
          onClick={() => {
            if (typeof window !== "undefined" && window.gtag) {
              window.gtag("event", "homepage_cta_start_free_click", {
                event_category: "conversion",
                event_label: "hero_primary",
              });
            }
          }}
        >
          Start free
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-neutral-100 ring-1 ring-neutral-700 hover:bg-neutral-900 hover:ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all"
          onClick={() => {
            if (typeof window !== "undefined" && window.gtag) {
              window.gtag("event", "homepage_signin_click", {
                event_category: "engagement",
                event_label: "hero_secondary",
              });
            }
          }}
        >
          Sign in
        </Link>
      </motion.div>

      <motion.p 
        className="mt-3 text-sm text-neutral-400"
        initial={shouldReduceMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
      >
        Free tier available. No credit card required.
      </motion.p>

      <motion.div 
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-900/40 px-4 py-2 text-sm text-neutral-400 ring-1 ring-neutral-800/50 backdrop-blur-sm"
        initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <svg className="h-4 w-4 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Live in under 60 seconds
      </motion.div>
    </div>
  );
}

function HeroImage() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="w-full max-w-[560px] sm:max-w-[620px] lg:max-w-[640px] xl:max-w-[720px]"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative w-full aspect-[16/10]">
        {/* Subtle glow effect behind the image */}
        <div className="absolute inset-0 translate-y-4 blur-2xl opacity-30 bg-gradient-to-br from-sky-500/20 via-emerald-500/15 to-transparent rounded-2xl" />
        
        {/* Image wrapper with subtle border and shadow */}
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-neutral-800/50 shadow-2xl shadow-black/40">
          <Image
            src="https://res.cloudinary.com/dr75zvtso/image/upload/v1771248057/screenshot-mockup_kgv8ks.png"
            alt="CRISP Content Engine interface"
            width={1440}
            height={900}
            priority
            className="w-full h-full object-cover"
          />
          
          {/* Subtle reflection overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />
        </div>
      </div>
    </motion.div>
  );
}

function ValueBlocks() {
  const blocks = [
    {
      title: "Plan with structure",
      description: "Turn scattered ideas into a repeatable content engine.",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      title: "Generate with intent",
      description: "Content aligned to your voice, niche and goals.",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: "Publish when ready",
      description: "Approve, schedule and publish across platforms.",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid gap-8 md:grid-cols-3">
      {blocks.map((block, idx) => (
        <GlassCard key={idx} delay={idx * 0.08}>
          <div className="p-8">
            {/* Icon with glow */}
            <div className="relative inline-flex">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/20 to-emerald-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-900/50 text-neutral-400 ring-1 ring-neutral-800/50 group-hover:from-neutral-800 group-hover:to-neutral-850 group-hover:text-neutral-300 group-hover:ring-neutral-700/50 transition-all duration-300">
                {block.icon}
              </div>
            </div>
            
            <h3 className="mt-6 text-xl font-semibold text-neutral-100 tracking-tight">
              {block.title}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-neutral-400">
              {block.description}
            </p>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function ConversionBand() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl bg-neutral-900/50 ring-1 ring-neutral-800/50 px-8 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl">
          Start free in minutes.
        </h2>
        <p className="mt-3 text-base text-neutral-400 sm:text-lg">
          Create content now. Upgrade only when you need scheduling and multi-channel publishing.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-in?signup=true"
            className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold bg-sky-400 text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all shadow-lg shadow-sky-400/25 hover:shadow-xl hover:shadow-sky-400/30"
            onClick={() => {
              if (typeof window !== "undefined" && window.gtag) {
                window.gtag("event", "homepage_cta_start_free_click", {
                  event_category: "conversion",
                  event_label: "conversion_band",
                });
              }
            }}
          >
            Start free
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-neutral-100 ring-1 ring-neutral-700 hover:bg-neutral-900 hover:ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all"
            onClick={() => {
              if (typeof window !== "undefined" && window.gtag) {
                window.gtag("event", "homepage_signin_click", {
                  event_category: "engagement",
                  event_label: "conversion_band",
                });
              }
            }}
          >
            Sign in
          </Link>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          No credit card required.
        </p>
      </div>
    </motion.div>
  );
}

function FreeTierSection() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="mx-auto max-w-4xl"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900/60 via-neutral-900/40 to-neutral-900/20 p-10 ring-1 ring-neutral-800/50 backdrop-blur-xl lg:p-14">
          {/* Top edge highlight */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neutral-700/50 to-transparent" />
          
          <h2 className="text-center text-3xl font-semibold tracking-tight text-neutral-100 sm:text-4xl">
            Start free. Upgrade when ready.
          </h2>
          
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Free includes
              </h3>
              <ul className="mt-5 space-y-4">
                {[
                  "Content generation",
                  "Structured system",
                  "Save drafts",
                  "Limited publishing",
                ].map((item, idx) => (
                  <motion.li
                    key={idx}
                    className="flex items-start gap-3 text-neutral-300"
                    initial={shouldReduceMotion ? {} : { opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Paid unlocks
              </h3>
              <ul className="mt-5 space-y-4">
                {[
                  "Scheduling",
                  "Multi-channel publishing",
                  "Advanced workflows",
                  "Priority processing",
                ].map((item, idx) => (
                  <motion.li
                    key={idx}
                    className="flex items-start gap-3 text-neutral-300"
                    initial={shouldReduceMotion ? {} : { opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>

          <motion.div 
            className="mt-10 text-center"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <p className="text-sm text-neutral-500">
              Join founders building consistently
            </p>
          </motion.div>
        </div>
    </motion.div>
  );
}

function FooterNote() {
  return (
    <div className="mt-20 pt-10 text-center">
      {/* Soft gradient divider */}
      <div className="mx-auto mb-10 h-px w-full max-w-lg bg-gradient-to-r from-transparent via-neutral-800/50 to-transparent" />
      
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link 
          href="/sign-in" 
          className="font-medium text-neutral-300 hover:text-neutral-100 transition-colors"
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_signin_click', {
                event_category: 'engagement',
                event_label: 'footer',
              });
            }
          }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
