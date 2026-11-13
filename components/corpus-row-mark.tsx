"use client";

import { useState } from "react";
import { DrawnMark, imageIsFlat } from "./drawn-mark";

/** Corpus mark: a stored local logo, or a drawn seal when the file is missing or blank. */
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
        onLoad={(event) => {
          if (imageIsFlat(event.currentTarget)) setOk(false);
        }}
        onError={() => setOk(false)}
      />
    );
  }
  return <DrawnMark name={name} className="c-mono h-7 w-7" />;
}
