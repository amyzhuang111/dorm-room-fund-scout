"use client";

import { useState } from "react";

/** Mobile corpus mark: verified local logo when provided, else monogram. Never hotlink. */
export function CorpusRowMark({
  name,
  website,
  logoUrl,
}: {
  name: string;
  website: string | null;
  logoUrl?: string | null;
}) {
  void website;
  const src = logoUrl && logoUrl.startsWith("/") ? logoUrl : null;
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
        loading="lazy"
        decoding="async"
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
    <span className="c-mono" aria-hidden data-logo-fallback="seal">
      {initial}
    </span>
  );
}
