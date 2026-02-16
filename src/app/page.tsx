"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[20%] left-[15%] w-[500px] h-[500px] bg-sky-500/[0.08] blur-[120px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="relative py-16 sm:py-20 lg:py-24">
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
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10 xl:px-12">
          <ValueBlocks />
        </div>
      </section>

      {/* Free Tier Section */}
      <section className="py-16 sm:py-20 lg:py-24">
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
    <div className="relative z-10 max-w-2xl space-y-6">
      <motion.h1 
        className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        Build consistent visibility without burning out.
      </motion.h1>

      <motion.p 
        className="max-w-xl text-base sm:text-lg text-white/70 leading-relaxed"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        CRISP turns your ideas into a structured content system. Free to start. No credit card required.
      </motion.p>

      <motion.div 
        className="flex flex-wrap items-center gap-4"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <Link
          href="/sign-in?signup=true"
          className="inline-flex items-center justify-center h-11 rounded-full px-6 text-sm font-medium bg-sky-400 text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-colors shadow-lg shadow-sky-400/20"
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
          className="text-sm text-white/70 hover:text-white transition-colors"
          onClick={() => {
            if (typeof window !== "undefined" && window.gtag) {
              window.gtag("event", "homepage_signin_click", {
                event_category: "engagement",
                event_label: "hero_link",
              });
            }
          }}
        >
          Already have an account? <span className="font-medium">Sign in</span>
        </Link>
      </motion.div>
    </div>
  );
}

function HeroImage() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="w-full max-w-[520px] sm:max-w-[600px] lg:max-w-[620px] xl:max-w-[680px]"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 40 }}
      animate={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -6, 0] }}
      whileHover={shouldReduceMotion ? {} : { y: -8 }}
      transition={
        shouldReduceMotion
          ? { duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }
          : {
              opacity: { duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.2 },
            }
      }
    >
      <div className="relative w-full aspect-[16/10]">
        {/* Subtle localized glow behind mock only */}
        <div className="absolute inset-0 translate-y-2 blur-3xl opacity-[0.15] bg-gradient-to-br from-sky-500/40 to-transparent rounded-2xl" />
        
        {/* Image wrapper with subtle border and shadow */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/30 transition-all duration-300 hover:shadow-black/40">
          <Image
            src="https://res.cloudinary.com/dr75zvtso/image/upload/v1771248057/screenshot-mockup_kgv8ks.png"
            alt="CRISP Content Engine interface"
            width={1440}
            height={900}
            priority
            className="w-full h-full object-cover"
          />
          
          {/* Glass reflection overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-transparent pointer-events-none" />
        </div>
      </div>
    </motion.div>
  );
}

function ValueBlocks() {
  const shouldReduceMotion = useReducedMotion();
  
  const blocks = [
    {
      title: "Plan with structure",
      description: "Turn scattered ideas into a repeatable content engine.",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      title: "Generate with intent",
      description: "Content aligned to your voice, niche and goals.",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: "Publish when ready",
      description: "Approve, schedule and publish across platforms.",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
      {blocks.map((block, idx) => (
        <motion.div
          key={idx}
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          whileHover={shouldReduceMotion ? {} : { y: -2 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{
            opacity: { duration: 0.5, delay: idx * 0.1 },
            y: { duration: 0.3, ease: "easeOut" },
          }}
          className="group h-full bg-white/[0.05] border border-white/10 rounded-2xl p-6 transition-all duration-300 ease-out hover:bg-white/[0.07] hover:border-white/15"
        >
          <div className="flex h-10 w-10 items-center justify-center text-white/70">
            {block.icon}
          </div>
          
          <h3 className="mt-4 text-base font-medium text-neutral-100">
            {block.title}
          </h3>
          <p className="mt-2 text-sm text-white/65 leading-relaxed">
            {block.description}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

function FreeTierSection() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="mx-auto max-w-4xl bg-white/[0.05] border border-white/10 rounded-2xl p-8 sm:p-10 lg:p-12"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <h2 className="text-center text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-100">
        Start free. Upgrade when ready.
      </h2>
      
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-white/70">
            Free includes
          </h3>
          <ul className="mt-4 space-y-3">
            {[
              "Content generation",
              "Structured system",
              "Save drafts",
              "Limited publishing",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/85">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-white/70">
            Paid unlocks
          </h3>
          <ul className="mt-4 space-y-3">
            {[
              "Scheduling",
              "Multi-channel publishing",
              "Advanced workflows",
              "Priority processing",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/65">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
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
