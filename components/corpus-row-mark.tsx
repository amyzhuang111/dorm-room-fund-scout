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
          if (img.naturalWidth <= 16 && img.naturalHeight <= 16) {
            setOk(false);
            return;
          }
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 8;
            canvas.height = 8;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, 8, 8);
            const data = ctx.getImageData(0, 0, 8, 8).data;
            let opaque = 0;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) {
              if ((data[i + 3] ?? 0) < 24) continue;
              opaque += 1;
              sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
            }
            if (opaque < 6 || (opaque > 0 && sum / opaque > 720)) setOk(false);
          } catch {
            /* Cross-origin pixels stay as loaded. */
          }
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
