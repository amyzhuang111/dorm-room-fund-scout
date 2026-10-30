import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
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

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
  preload: true,
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Campus Scout",
  description: "Student founder intelligence, by campus.",
};

const themeScript = `try{var t=localStorage.getItem("campus-scout-theme");document.documentElement.dataset.theme=t==="day"?"day":"night"}catch(e){document.documentElement.dataset.theme="night"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="night"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg">
        <UserPipelineProvider>
            <header className="sticky top-0 z-40">
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
