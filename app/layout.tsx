import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AskAiProvider } from "@/components/ask-ai";
import { TopNavGate } from "@/components/top-nav-gate";
import { FeedbackProvider } from "@/components/feedback-provider";
import { UserPipelineBanner, UserPipelineProvider } from "@/components/user-pipeline-provider";
import { feedbackRedirects } from "@/lib/domain/entity-redirects";
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
  title: "Campus Scout",
  description: "A Founder Scout and Startup Scout workspace for pre-seed student prospects, by university.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Satoshi, loaded from Fontshare. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" media="print" />
        <script dangerouslySetInnerHTML={{ __html: `document.querySelector('link[href*="fontshare"]')?.setAttribute('media','all')` }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AskAiProvider>
          <UserPipelineProvider>
          <header className="border-b border-border-c bg-background">
            <Suspense fallback={<div className="h-14" />}>
              <TopNavGate />
            </Suspense>
          </header>
          <UserPipelineBanner />
          <FeedbackProvider redirects={feedbackRedirects()}>
            <main className="flex-1">{children}</main>
          </FeedbackProvider>
          </UserPipelineProvider>
          <Analytics />
        </AskAiProvider>
      </body>
    </html>
  );
}
