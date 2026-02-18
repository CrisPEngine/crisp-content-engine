import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { Analytics } from "@/components/Analytics";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
  title: "CRISP Content Engine",
  description: "Build consistent visibility without burning out. CRISP turns your ideas into a structured content system. Free to start.",
  icons: {
    icon: [
      { url: "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png", sizes: "128x128", type: "image/png" },
    ],
    apple: "https://res.cloudinary.com/dr75zvtso/image/upload/v1762342722/favicon_crispContentEngine_128x128_m1m2ry.png",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.crispdigital.io"),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} body-grid min-h-screen`}>
        {children}
        <CookieConsent />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
