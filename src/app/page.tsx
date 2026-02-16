"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ProductMockup3D } from "@/components/ProductMockup3D";
import { GlassCard } from "@/components/GlassCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <Header />
        
        {/* Hero Section */}
        <section className="relative mt-16 lg:mt-20">
          <AnimatedBackground />
          
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left: Hero content */}
            <HeroContent />
            
            {/* Right: 3D Product Mockup */}
            <div className="order-first lg:order-last">
              <ProductMockup3D />
            </div>
          </div>
        </section>

        {/* Value Blocks */}
        <section className="mt-32 lg:mt-40">
          <ValueBlocks />
        </section>

        {/* Free Tier Section */}
        <section className="mt-32 lg:mt-40">
          <FreeTierSection />
        </section>

        <FooterNote />
      </div>
    </main>
  );
}

const FAVICON_URL = "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png";

function Header() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.header 
      className="flex items-center justify-between sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-sm py-4 -mx-6 px-6 border-b border-neutral-900/50"
      initial={shouldReduceMotion ? {} : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 group">
        <img
          src={FAVICON_URL}
          alt=""
          className="h-9 w-9 rounded-lg object-contain ring-1 ring-neutral-800 group-hover:ring-neutral-700 transition-all"
          width={36}
          height={36}
        />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">CRISP</div>
          <div className="text-xs text-neutral-400">Content Engine</div>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex items-center gap-3">
        <Link
          href="/sign-in"
          className="rounded-full px-5 py-2 text-sm font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900/50 transition-all"
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_signin_click', {
                event_category: 'engagement',
                event_label: 'header',
              });
            }
          }}
        >
          Sign in
        </Link>
        
        <AnimatedButton
          href="/sign-in?signup=true"
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_cta_start_free_click', {
                event_category: 'conversion',
                event_label: 'header',
              });
            }
          }}
        >
          Start free
        </AnimatedButton>
      </nav>
    </motion.header>
  );
}

function HeroContent() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative z-10">
      <motion.h1 
        className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl leading-[1.1]"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        Build consistent visibility without burning out.
      </motion.h1>

      <motion.p 
        className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-neutral-300 sm:text-xl"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        CRISP turns your ideas into a structured content system.
        <br />
        <span className="text-neutral-400">Free to start. No setup friction.</span>
      </motion.p>

      <motion.div 
        className="mt-10 flex flex-wrap items-center gap-4"
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <AnimatedButton
          href="/sign-in?signup=true"
          primary
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_cta_start_free_click', {
                event_category: 'conversion',
                event_label: 'hero_primary',
              });
            }
          }}
        >
          Start free
        </AnimatedButton>

        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-neutral-100 ring-1 ring-neutral-700 hover:bg-neutral-900 hover:ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all hover:-translate-y-0.5"
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_signin_click', {
                event_category: 'engagement',
                event_label: 'hero_secondary',
              });
            }
          }}
        >
          Sign in
        </Link>
      </motion.div>

      <motion.p 
        className="mt-6 text-sm text-neutral-400"
        initial={shouldReduceMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        Free tier available. No credit card required.
      </motion.p>

      <motion.div 
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-neutral-900/40 px-4 py-2 text-sm text-neutral-400 ring-1 ring-neutral-800/50 backdrop-blur-sm"
        initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <svg className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Live in under 60 seconds
      </motion.div>
    </div>
  );
}

function AnimatedButton({ 
  children, 
  href, 
  primary = false,
  onClick,
}: { 
  children: React.ReactNode; 
  href: string; 
  primary?: boolean;
  onClick?: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={shouldReduceMotion ? {} : { scale: 1.03 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Link
        href={href}
        onClick={onClick}
        className={`
          inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-all
          ${primary 
            ? 'bg-sky-400 text-neutral-950 hover:bg-sky-300 focus:ring-sky-300 shadow-lg shadow-sky-400/25 hover:shadow-xl hover:shadow-sky-400/30' 
            : 'bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800 hover:ring-neutral-700 focus:ring-neutral-700'
          }
        `}
      >
        {children}
      </Link>
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
    <div className="mx-auto max-w-6xl">
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
    </div>
  );
}

function FreeTierSection() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="mx-auto max-w-4xl">
      <motion.div
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
    </div>
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
