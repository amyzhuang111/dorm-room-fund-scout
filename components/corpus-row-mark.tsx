"use client";

import { useState } from "react";
import { campusInk } from "@/lib/display/campus-ink";

/** Mobile corpus mark: verified local logo when provided, else campus-ink monogram. Never hotlink. */
export function CorpusRowMark({
  name,
  website,
  logoUrl,
  campus,
}: {
  name: string;
  website: string | null;
  logoUrl?: string | null;
  campus?: string | null;
}) {
  void website;
  const src = logoUrl && logoUrl.startsWith("/") ? logoUrl : null;
  const initial = (name.trim()[0] || "?").toUpperCase();
  const ink = campusInk(campus);
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
    <span
      className="c-mono"
      aria-hidden
      data-logo-fallback="seal"
      data-campus-ink={ink}
      style={{
        color: ink,
        borderColor: `color-mix(in srgb, ${ink} 55%, transparent)`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${ink} 12%, #FFFFFF), color-mix(in srgb, ${ink} 22%, #EEF1FB))`,
      }}
    >
      {initial}
    </span>
  );
}
