"use client";

import { useState } from "react";

function faviconUrl(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

/** Mobile corpus mark: real site favicon when it loads, else monogram. */
export function CorpusRowMark({ name, website }: { name: string; website: string | null }) {
  const src = faviconUrl(website);
  const initial = (name.trim()[0] || "?").toUpperCase();
  const [ok, setOk] = useState(Boolean(src));
  if (src && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={28}
        height={28}
        className="c-logo"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth <= 16 && img.naturalHeight <= 16) setOk(false);
        }}
        onError={() => setOk(false)}
      />
    );
  }
  return (
    <span className="c-mono" aria-hidden>
      {initial}
    </span>
  );
}
