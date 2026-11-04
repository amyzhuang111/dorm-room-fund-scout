import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AskAiDockSlot } from "@/components/ask-ai-dock-slot";
import { SiteNav } from "@/components/site-nav";
import { FeedbackProvider } from "@/components/feedback-provider";
import { UserPipelineProvider } from "@/components/user-pipeline-provider";
import { feedbackRedirects } from "@/lib/domain/entity-redirects";
import { latestDataTimestamp } from "@/lib/domain/hero-stats";
import { absoluteDate } from "@/lib/domain/relative-time";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: true,
});

/** Self-hosted italic companion for pull-quotes / instrument lines. */
const instrument = localFont({
  src: "../public/fonts/instrument-serif-italic.woff2",
  variable: "--font-instrument",
  style: "italic",
  weight: "400",
  display: "swap",
  preload: true,
});

/** Self-hosted Fraunces for display titles. */
const display = localFont({
  src: [
    { path: "../public/fonts/fraunces-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/fraunces-latin-ext-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  preload: true,
});



/** 085e0c0 Google Fraunces — fold + campuses display headings only (r32). */
const displayClassic = Fraunces({
  variable: "--font-display-classic",
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  preload: false,
});

/** Self-hosted Newsreader for richer section headings (pairs with Fraunces). */
const heading = localFont({
  src: "../public/fonts/newsreader-latin-600.woff2",
  variable: "--font-heading",
  weight: "600",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: { default: "Campus Scout", template: "%s · Campus Scout" },
  description: "Student founder intelligence, by campus.",
};

const themeScript = `try{document.documentElement.dataset.theme="day";document.documentElement.dataset.sample="halflight";}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="day"
      data-sample="halflight"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${display.variable} ${displayClassic.variable} ${heading.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg">
        <UserPipelineProvider>
            <header className="sticky top-0 z-40 bg-[#FFFFFF]" data-site-chrome="">
              <Suspense fallback={<div className="h-12 border-b border-line bg-bg" />}>
                <SiteNav />
              </Suspense>
            </header>
            <FeedbackProvider redirects={feedbackRedirects()}>
              <main className="flex-1">{children}</main>
            </FeedbackProvider>
          </UserPipelineProvider>
          <footer className="border-t border-line px-6 py-6 text-[14px] text-fg-2">
            <div className="flex gap-5">
              <Link href="/methodology">Methodology</Link>
              <Link href="/settings">Settings</Link>
              <Link href="/signin">Sign in</Link>
              <span className="ml-auto tabular-nums">Data through {absoluteDate(latestDataTimestamp())}</span>
            </div>
          </footer>
          <AskAiDockSlot />
          <Analytics />
      </body>
    </html>
  );
}
