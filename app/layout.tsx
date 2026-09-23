import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { TopNav } from "@/components/top-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Campus Scout — DRF sourcing",
  description: "An independent Founder Scout / Startup Scout sourcing workspace for Dorm Room Fund-shaped pre-seed prospects, by university.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Satoshi is dormroomfund.com's actual brand font (var(--font-family--heading/body) in
            their stylesheet); loaded from Fontshare, the font's own free CDN. */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border-c bg-surface">
          <Suspense fallback={<div className="h-14" />}>
            <TopNav />
          </Suspense>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border-c px-4 py-3 text-center text-xs text-muted sm:px-6">
          Independent scouting workspace — not an official Dorm Room Fund product. No automatic outreach; nothing here implies Amy represents DRF.
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
