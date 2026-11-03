"use client";

import { SampleTheme } from "./sample-theme";

/** Force daylight chrome so /data never ships a dark header/nav. */
export function DataTheme() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.dataset.theme="day";document.documentElement.dataset.sample="halflight";}catch(e){}`,
        }}
      />
      <SampleTheme />
    </>
  );
}
