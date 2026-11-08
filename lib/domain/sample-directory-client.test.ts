import assert from "node:assert/strict";
import { buildDirectoryFromDb } from "./directory";
import { eligibleCompanyIds } from "./counted-membership";
import { GET } from "../../app/api/sample-directory/route";
import {
  SAMPLE_DIRECTORY_API,
  SAMPLE_DIRECTORY_FILE,
  clearSampleDirectoryCache,
  fetchSampleDirectory,
} from "./sample-directory-client";

const realFetch = globalThis.fetch;

async function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  clearSampleDirectoryCache();
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
    clearSampleDirectoryCache();
  }
}

async function main() {
const calls: string[] = [];
await withFetch(async (input) => {
  const url = String(input);
  calls.push(url);
  if (url === SAMPLE_DIRECTORY_FILE) return new Response("missing", { status: 404 });
  if (url === SAMPLE_DIRECTORY_API) return Response.json({ cards: [{ id: "proj_a", name: "Arden" }] });
  return new Response("unexpected", { status: 500 });
}, async () => {
  calls.length = 0;
  const cards = await fetchSampleDirectory();
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.name, "Arden");
  assert.deepEqual(calls, [SAMPLE_DIRECTORY_FILE, SAMPLE_DIRECTORY_API]);
});

await withFetch(async (input) => {
  const url = String(input);
  calls.push(url);
  return new Response("down", { status: 503 });
}, async () => {
  calls.length = 0;
  await assert.rejects(() => fetchSampleDirectory(), /directory 503/);
  assert.deepEqual(calls, [SAMPLE_DIRECTORY_FILE, SAMPLE_DIRECTORY_API]);
});

const response = GET();
assert.equal(response.status, 200);
const body = (await response.json()) as { cards: { id: string }[] };
const ids = body.cards.map((card) => card.id).sort();
assert.deepEqual(ids, eligibleCompanyIds().sort());
assert.equal(body.cards.length, buildDirectoryFromDb().cards.length);

console.log("sample directory client tests ok");
}
main();
