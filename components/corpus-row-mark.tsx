"use client";

import { useState } from "react";

/** A loaded file that is a flat tile or a near-black square is not a usable mark. */
export function logoLooksBlank(img: HTMLImageElement): boolean {
  if (img.naturalWidth < 20 || img.naturalHeight < 20) return true;
  try {
    const size = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    let sumSq = 0;
    let dark = 0;
    let opaque = 0;
    const n = size * size;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += y;
      sumSq += y * y;
      if (data[i + 3] > 40) opaque += 1;
      if (data[i + 3] > 200 && y < 24) dark += 1;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return opaque < 6 || dark > n * 0.8 || variance < 18;
  } catch {
    return false;
  }
}

/** Corpus mark: verified local logo when it has real pixels, else monogram. Never hotlink. */
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
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0 && logoLooksBlank(img)) setOk(false);
        }}
        onLoad={(e) => {
          if (logoLooksBlank(e.currentTarget)) setOk(false);
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
