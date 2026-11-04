import assert from "node:assert/strict";
import { sanitizePitch, pitchStartsBad, isBoilerplatePitch } from "./sanitize-pitch";

assert.equal(
  sanitizePitch("Intempus ... equipping robots with emotional intelligence."),
  "Intempus equipping robots with emotional intelligence",
);
assert.equal(
  sanitizePitch("Baleena … captures microfibers at their laundry point source"),
  "Baleena captures microfibers at their laundry point source",
);
assert.ok(!(sanitizePitch("Intempus ... equipping robots") || "").includes("..."));
assert.ok(!(sanitizePitch("Intempus … equipping robots") || "").includes("…"));

assert.equal(
  sanitizePitch(
    "…ns Health (YC S17, formerly Totemic). Built deep learning radars in consumer electronics for the home.",
  ),
  "Built deep learning radars in consumer electronics for the home",
);

assert.equal(
  sanitizePitch(
    "…him and saw him waste hours every day on manual paperwork. That's where Stockline comes from. I made it a personal mission.",
  ),
  "That's where Stockline comes from. I made it a personal mission",
);

assert.equal(
  sanitizePitch(
    "…o Infinity, I co-founded Edge Analytics, an ML consulting company that we grew to 12 engineers.",
  ),
  "I co-founded Edge Analytics, an ML consulting company that we grew to 12 engineers",
);

assert.equal(
  sanitizePitch("mit '23 computer science graduate building ... [Nowadays] summer 2023 batch"),
  "MIT '23 computer science graduate building summer 2023 batch",
);
assert.ok(!(sanitizePitch("mit '23 building [Nowadays] xxxxxx more words here") || "").includes("["));

assert.equal(
  sanitizePitch("is building food automation for quick-service dining areas.", "Munch Industries"),
  "Munch Industries is building food automation for quick-service dining areas",
);

assert.equal(
  sanitizePitch("Co-founder of Sciloop (YC F25), On Leave From MIT"),
  "Co-founder of Sciloop (YC F25), On Leave From MIT",
);

assert.equal(sanitizePitch("him and saw him waste hours every day on paperwork alone"), null);
assert.ok(!pitchStartsBad(sanitizePitch("MIT dropout building robots for warehouses and factories")!));

// Quoted Bio / Speedrun mid-word segments: snap or drop
{
  const snapped = sanitizePitch(
    `Y Combinator's page for Tivara (Summer 2024) lists Aumesh Misra (Founder). Bio excerpt: "pany to over $2B AUM. He previously worked at Bridgewater."`,
  );
  assert.ok(snapped && !/"pany/.test(snapped), snapped);
  assert.ok(snapped && /He previously worked at Bridgewater/.test(snapped), snapped);
  assert.ok(snapped && !pitchStartsBad(snapped.split('Bio excerpt: "')[1] || snapped), snapped);
}
{
  const abel = sanitizePitch(
    `Abel Dagne, Founder & CEO of Oasiz, on the Speedrun page: "s a highly technical"`,
  );
  // Unsnappable quote dropped; keep the clean outer lead (not mid-word junk).
  assert.ok(abel && !/"s a highly/.test(abel), abel);
  assert.ok(abel && /Abel Dagne/.test(abel), abel);
  assert.ok(!pitchStartsBad(abel!), abel);
}

// Speedrun banner → none
assert.equal(
  sanitizePitch(
    "Had trouble submitting? Complete your SR008 application by tonight at 11:59 PM PT. Submit now → speedrun.a16z.com/apply",
  ),
  null,
);
assert.equal(
  sanitizePitch(
    "Harbor AI Had trouble submitting? Complete your SR008 application by tonight at 11:59 PM PT…",
  ),
  null,
);

// Missing period after URL strip
{
  const kastle = sanitizePitch(
    "Rishi is the co-founder and CEO of Kastle (www.kastle.ai) Before Kastle, Rishi was the founding Product Manager at Scale AI.",
  );
  assert.ok(kastle && /Kastle\. Before Kastle/.test(kastle), kastle);
}

assert.ok(isBoilerplatePitch("Had trouble submitting? Complete your SR008 application by tonight"));
assert.ok(!isBoilerplatePitch("Building robotics for warehouses at MIT"));

console.log("sanitize-pitch tests ok");
