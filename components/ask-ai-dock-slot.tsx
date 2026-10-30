"use client";

import dynamic from "next/dynamic";

// Ask, and the WebLLM worker it can start, stay out of the first-load graph.
const AskAiDock = dynamic(() => import("./ask-ai").then((mod) => mod.AskAiDock), { ssr: false });

export function AskAiDockSlot() {
  return <AskAiDock />;
}
