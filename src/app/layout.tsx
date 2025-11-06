import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CrisP Content Engine",
  icons: {
    icon: "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png",
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
        {/* Top bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xs bg-bg/60 border-b border-edge/60 min-h-[90px] flex items-center">
          <div className="mx-auto max-w-5xl px-6 w-full flex items-center">
            <a href="/" className="flex items-center">
              <img 
                src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
                alt="CrisP Content Engine" 
                className="h-20 w-auto"
              />
            </a>
          </div>
        </header>
        {/* Page */}
        <main className="mx-auto max-w-5xl px-6 py-10">
          {children}
        </main>
        {/* Glow accents */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute right-[15%] top-[12%] h-60 w-60 rounded-full bg-primary/10 blur-3xl animate-float" />
          <div className="absolute left-[8%] bottom-[8%] h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-float" />
        </div>
        {/* Footer */}
        <footer className="border-t border-edge/60 py-6 mt-12">
          <div className="mx-auto max-w-5xl px-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4 text-sm text-text-dim">
                <div className="flex items-center gap-2">
                  <img 
                    src="https://res.cloudinary.com/dr75zvtso/image/upload/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png" 
                    alt="CrisP Content Engine" 
                    className="h-4 w-auto opacity-70"
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
                </div>
              </div>
              <div className="text-xs text-text-dim">
                Created and developed by CrisP Digital trading as ABL International FZE (3637)
              </div>
            </div>
          </div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
