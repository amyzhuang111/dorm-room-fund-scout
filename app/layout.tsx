import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AskAiProvider } from "@/components/ask-ai";
import { SiteNav } from "@/components/site-nav";
import { FeedbackProvider } from "@/components/feedback-provider";
import { UserPipelineProvider } from "@/components/user-pipeline-provider";
import { feedbackRedirects } from "@/lib/domain/entity-redirects";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

export const metadata: Metadata = {
  title: "Campus Scout",
  description: "Student founder intelligence, by campus.",
};

const themeScript = `try{var t=localStorage.getItem("campus-scout-theme");document.documentElement.dataset.theme=t==="night"||t==="day"?t:(location.pathname==="/"?"night":"day")}catch(e){document.documentElement.dataset.theme=location.pathname==="/"?"night":"day"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-fg">
        <AskAiProvider>
          <UserPipelineProvider>
            <header className="sticky top-0 z-40">
              <Suspense fallback={<div className="h-16 border-b border-line bg-bg" />}>
                <SiteNav />
              </Suspense>
            </header>
            <FeedbackProvider redirects={feedbackRedirects()}>
              <main className="flex-1">{children}</main>
            </FeedbackProvider>
          </UserPipelineProvider>
          <footer className="border-t border-line px-5 py-6 text-[13px] text-fg-3 sm:px-12">
            <div className="mx-auto flex max-w-[1200px] gap-5">
              <Link href="/methodology">Methodology</Link>
              <Link href="/settings">Settings</Link>
              <Link href="/signin">Sign in</Link>
            </div>
          </footer>
          <Analytics />
        </AskAiProvider>
      </body>
    </html>
  );
}
