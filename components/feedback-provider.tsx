"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  FEEDBACK_COOKIE,
  type FeedbackRecord,
  nameKey,
  parseFeedbackCookie,
  removeFeedback,
  serializeFeedbackCookie,
  upsertFeedback,
} from "@/lib/domain/feedback";

const STORAGE_KEY = "campus-scout-feedback-v1";
const TOKEN_KEY = "campus-scout-feedback-token";
const CHANGE = "scout-feedback-change";

interface FeedbackApi {
  records: FeedbackRecord[];
  token: string;
  setToken: (token: string) => void;
  remote: "off" | "on" | "rejected";
  setAction: (record: Omit<FeedbackRecord, "at" | "note"> & { note?: string }) => void;
  setNote: (target: Pick<FeedbackRecord, "entityType" | "entityId" | "nameKey" | "domainKey">, note: string) => void;
  undo: (target: { entityType: FeedbackRecord["entityType"]; entityId: string; name: string; domain: string | null }) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

function emit() {
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

const EMPTY_RECORDS: FeedbackRecord[] = [];
let cachedRaw = "";
let cachedRecords: FeedbackRecord[] = EMPTY_RECORDS;

function readRecords(): FeedbackRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? "[]";
    if (raw === cachedRaw) return cachedRecords;
    cachedRaw = raw;
    cachedRecords = parseFeedbackCookie(encodeURIComponent(raw));
    return cachedRecords;
  } catch {
    return EMPTY_RECORDS;
  }
}

function writeCookie(records: FeedbackRecord[]) {
  document.cookie = `${FEEDBACK_COOKIE}=${serializeFeedbackCookie(records)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function saveRecords(records: FeedbackRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  writeCookie(records);
  emit();
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const records = useSyncExternalStore(subscribe, readRecords, () => EMPTY_RECORDS);
  const token = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(TOKEN_KEY) ?? "",
    () => ""
  );
  const [remote, setRemote] = useState<"off" | "on" | "rejected">("off");

  useEffect(() => {
    writeCookie(readRecords());
    const saved = localStorage.getItem(TOKEN_KEY) ?? "";
    if (!saved) return;
    let cancelled = false;
    fetch("/api/feedback", { headers: { "x-feedback-token": saved } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setRemote("rejected");
          return;
        }
        const data = (await res.json()) as { configured?: boolean; records?: FeedbackRecord[] | null };
        if (!data.configured) {
          setRemote("off");
          return;
        }
        setRemote("on");
        if (Array.isArray(data.records) && data.records.length > 0) {
          saveRecords(data.records);
          router.refresh();
        }
      })
      .catch(() => {
        if (!cancelled) setRemote("off");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const sync = useCallback(
    (next: FeedbackRecord[], syncToken: string) => {
      saveRecords(next);
      if (syncToken) {
        fetch("/api/feedback", {
          method: "PUT",
          headers: { "x-feedback-token": syncToken, "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then((res) => setRemote(res.status === 401 ? "rejected" : res.ok ? "on" : "off"))
          .catch(() => setRemote("off"));
      }
      router.refresh();
    },
    [router]
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      records,
      token,
      remote,
      setToken: (value: string) => {
        localStorage.setItem(TOKEN_KEY, value);
        emit();
      },
      setAction: (record) => {
        sync(upsertFeedback(records, { ...record, note: record.note ?? records.find((r) => r.entityId === record.entityId)?.note ?? "", at: new Date().toISOString() }), token);
      },
      setNote: (target, note) => {
        const existing = records.find((r) => r.entityType === target.entityType && r.entityId === target.entityId);
        if (!existing) {
          sync(
            upsertFeedback(records, {
              entityType: target.entityType,
              entityId: target.entityId,
              nameKey: target.nameKey || nameKey(target.entityId),
              domainKey: target.domainKey,
              action: "pass",
              note,
              at: new Date().toISOString(),
            }),
            token
          );
          return;
        }
        sync(
          records.map((r) => (r.entityType === target.entityType && r.entityId === target.entityId ? { ...r, note } : r)),
          token
        );
      },
      undo: (target) => sync(removeFeedback(records, target), token),
    }),
    [records, token, remote, sync]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      records: [],
      token: "",
      remote: "off",
      setToken: () => {},
      setAction: () => {},
      setNote: () => {},
      undo: () => {},
    };
  }
  return ctx;
}
