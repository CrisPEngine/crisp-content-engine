import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CRISP Content Engine - Build consistent visibility without burning out",
  description: "Create consistent content. Publish when ready. CRISP turns your ideas into a structured content system. Free to start.",
  openGraph: {
    title: "CRISP Content Engine - Build consistent visibility without burning out",
    description: "Create consistent content. Publish when ready. CRISP turns your ideas into a structured content system. Free to start.",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://app.crispdigital.io",
    siteName: "CRISP Content Engine",
    images: [
      {
        url: "https://res.cloudinary.com/dr75zvtso/image/upload/v1769501243/CCE-opengraph_1200x630_i8eylb.jpg",
        width: 1200,
        height: 630,
        alt: "CRISP Content Engine - Build consistent visibility without burning out",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "CRISP Content Engine - Build consistent visibility without burning out",
    description: "Create consistent content. Publish when ready. Free to start.",
    images: ["https://res.cloudinary.com/dr75zvtso/image/upload/v1769501243/CCE-opengraph_1200x630_i8eylb.jpg"],
  },
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-16">
        <Header />
        
        <div className="mt-16 lg:mt-24">
          <Hero />
        </div>

        <div className="mt-20 lg:mt-32">
          <ValueBlocks />
        </div>

        <div className="mt-20 lg:mt-32">
          <FreeTierSection />
        </div>

        <FooterNote />
      </div>
    </main>
  );
}

const FAVICON_URL = "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png";

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img
          src={FAVICON_URL}
          alt=""
          className="h-9 w-9 rounded-lg object-contain ring-1 ring-neutral-800"
          width={36}
          height={36}
        />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">CRISP</div>
          <div className="text-xs text-neutral-400">Content Engine</div>
        </div>
      </div>

      <nav className="flex items-center gap-3">
        <Link
          href="/sign-in"
          className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-900 transition-colors"
          onClick={() => {
            if (typeof window !== 'undefined' && window.gtag) {
              window.gtag('event', 'homepage_signin_click', {
                event_category: 'engagement',
                event_label: 'header',
              });
            }
          }}
        >
          Sign in to continue
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  const handleStartFreeClick = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'homepage_cta_start_free_click', {
        event_category: 'conversion',
        event_label: 'hero_primary',
      });
    }
  };

  const handleSignInClick = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'homepage_signin_click', {
        event_category: 'engagement',
        event_label: 'hero_secondary',
      });
    }
  };

  return (
    <section className="mx-auto max-w-3xl text-center">
      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
        Build consistent visibility without burning out.
      </h1>

      <p className="mt-6 mx-auto max-w-2xl text-pretty text-lg leading-relaxed text-neutral-300 sm:text-xl">
        CRISP turns your ideas into a structured content system.
        <br />
        Free to start. No setup friction.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/sign-in?signup=true"
          onClick={handleStartFreeClick}
          className="inline-flex items-center justify-center rounded-full bg-sky-400 px-7 py-3.5 text-base font-semibold text-neutral-950 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-colors shadow-lg shadow-sky-400/20"
        >
          Start free
        </Link>

        <Link
          href="/sign-in"
          onClick={handleSignInClick}
          className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-neutral-100 ring-1 ring-neutral-700 hover:bg-neutral-900 hover:ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:ring-offset-2 focus:ring-offset-neutral-950 transition-colors"
        >
          Sign in
        </Link>
      </div>

      <p className="mt-6 text-sm text-neutral-400">
        Free tier available. No credit card required.
      </p>

      <div className="mt-12 inline-flex items-center gap-2 rounded-full bg-neutral-900/40 px-4 py-2 text-sm text-neutral-400 ring-1 ring-neutral-800">
        <svg className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Live in under 60 seconds
      </div>
    </section>
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
    <section className="mx-auto max-w-5xl">
      <div className="grid gap-8 md:grid-cols-3">
        {blocks.map((block, idx) => (
          <div key={idx} className="group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800 group-hover:bg-neutral-800 group-hover:text-neutral-300 transition-colors">
              {block.icon}
            </div>
            <h3 className="mt-6 text-lg font-semibold text-neutral-100">
              {block.title}
            </h3>
            <p className="mt-2 text-base leading-relaxed text-neutral-400">
              {block.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FreeTierSection() {
  return (
    <section className="mx-auto max-w-4xl">
      <div className="rounded-2xl bg-neutral-900/40 p-8 ring-1 ring-neutral-800 backdrop-blur lg:p-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl">
          Start free. Upgrade when ready.
        </h2>
        
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Free includes
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "Content generation",
                "Structured system",
                "Save drafts",
                "Limited publishing",
              ].map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-neutral-300">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Paid unlocks
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "Scheduling",
                "Multi-channel publishing",
                "Advanced workflows",
                "Priority processing",
              ].map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-neutral-300">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-neutral-500">
            Join founders building consistently
          </p>
        </div>
      </div>
    </section>
  );
}

function FooterNote() {
  return (
    <div className="mt-16 border-t border-neutral-900 pt-8 text-center">
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
