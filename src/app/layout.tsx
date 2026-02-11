import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { Analytics } from "@/components/Analytics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SignOutLink } from "@/components/SignOutLink";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap', // Optimize font loading
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap', // Optimize font loading
  preload: false, // Only preload primary font
});

export const metadata: Metadata = {
  title: "CrisP Content Engine",
  description: "Your entire month of content. Generated once. AI-powered content engine with human approval.",
  icons: {
    icon: [
      { url: "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png", sizes: "128x128", type: "image/png" },
    ],
    apple: "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.crispdigital.io"),
  openGraph: {
    title: "CrisP Content Engine",
    description: "Your entire month of content. Generated once. AI-powered content engine with human approval.",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://app.crispdigital.io",
    siteName: "CrisP Content Engine",
    images: [
      {
        url: "https://res.cloudinary.com/dr75zvtso/image/upload/v1769501243/CCE-opengraph_1200x630_i8eylb.jpg",
        width: 1200,
        height: 630,
        alt: "CrisP Content Engine - Your entire month of content. Generated once.",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "CrisP Content Engine",
    description: "Your entire month of content. Generated once. AI-powered content engine with human approval.",
    images: ["https://res.cloudinary.com/dr75zvtso/image/upload/v1769501243/CCE-opengraph_1200x630_i8eylb.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} body-grid min-h-screen`}>
        {/* Top bar - only for site pages, app pages use AppHeader */}
        <header className="sticky top-0 z-30 backdrop-blur-xs bg-bg/60 border-b border-edge/60 min-h-[90px] flex items-center">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 w-full flex items-center">
            <a href="/" className="flex items-center">
              <img 
                src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
                alt="CrisP Content Engine" 
                className="h-20 w-auto"
                loading="eager"
                fetchPriority="high"
                width={1200}
                height={627}
              />
            </a>
          </div>
        </header>
        {/* Page */}
        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          {children}
        </main>
        {/* Glow accents */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute right-[15%] top-[12%] h-60 w-60 rounded-full bg-primary/10 blur-3xl animate-float" />
          <div className="absolute left-[8%] bottom-[8%] h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-float" />
        </div>
        {/* Footer */}
        <footer className="border-t border-edge/60 py-6 mt-12">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4 text-sm text-text-dim">
                <div className="flex items-center gap-2">
                  <img 
                    src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
                    alt="CrisP Content Engine" 
                    className="h-4 w-auto opacity-70"
                    loading="lazy"
                    width={1200}
                    height={627}
                  />
                  <span>© {new Date().getFullYear()} CRISP Content Engine</span>
                </div>
                <div className="flex items-center gap-4">
                  <Link href="https://www.crispdigital.io/cookies-policy" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
                    Cookies Policy
                  </Link>
                  <Link href="https://www.crispdigital.io/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
                    Privacy Policy
                  </Link>
                  <Link href="https://www.crispdigital.io/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-text-soft transition">
                    Terms of Service
                  </Link>
                  <SignOutLink />
                </div>
              </div>
              <div className="text-xs text-text-dim">
                Created and developed by CrisP Digital trading as ABL International FZE (3637)
              </div>
            </div>
          </div>
        </footer>
        <CookieConsent />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
