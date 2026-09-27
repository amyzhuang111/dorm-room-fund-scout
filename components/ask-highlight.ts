"use client";

import { useSyncExternalStore } from "react";

export interface AskHighlight {
  ids: string[];
  campuses: string[];
  startupIds: string[];
  personIds: string[];
  focusId: string | null;
  focusCampus: string | null;
  token: number;
}

let state: AskHighlight | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setAskHighlight(next: Omit<AskHighlight, "token"> | null) {
  if (!next) {
    state = null;
  } else {
    state = { ...next, token: (state?.token ?? 0) + 1 };
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAskHighlight(): AskHighlight | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
