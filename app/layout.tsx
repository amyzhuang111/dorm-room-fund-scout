import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AskAiProvider } from "@/components/ask-ai";
import { TopNavGate } from "@/components/top-nav-gate";
import { FeedbackProvider } from "@/components/feedback-provider";
import { UserPipelineBanner, UserPipelineProvider } from "@/components/user-pipeline-provider";
import { feedbackRedirects } from "@/lib/domain/entity-redirects";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
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
      className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AskAiProvider>
          <UserPipelineProvider>
          <header className="sticky top-0 z-40 border-b border-border-c bg-background">
            <Suspense fallback={<div className="h-16" />}>
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
