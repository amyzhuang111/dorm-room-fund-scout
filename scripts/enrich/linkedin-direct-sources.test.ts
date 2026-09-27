import assert from "node:assert/strict";
import { githubHandles, parseYcFounders } from "./linkedin-direct-sources";

const yc = `
{"full_name":"Sahith Reddy Chada","title":"Founder","avatar":"https://example.com/a","twitter_url":"https://x.com/sahithchada","linkedin_url":"https://www.linkedin.com/in/sahith-reddy-chada"}
{"full_name":"Christopher Golda","title":"Founder","linkedin_url":"https://www.linkedin.com/company/deploy"}
{"full_name":"Irene Grace Karot Polson","title":"Founder","linkedin_url":"https://www.linkedin.com/in/irene-grace-karot-polson/"}
`;
const founders = parseYcFounders(yc);
assert.deepEqual(
  founders.map((founder) => founder.name),
  ["Sahith Reddy Chada", "Irene Grace Karot Polson"]
);
assert.equal(founders[0].url, "https://www.linkedin.com/in/sahith-reddy-chada");

const devpost = `<a href="https://github.com/newrelic/newrelic-browser-agent/blob/main/docs">agent</a><a href="https://github.com/n1waii">GitHub</a>`;
assert.deepEqual(githubHandles(devpost, "Ni Wai"), ["n1waii"]);

console.log("linkedin-direct-sources.test.ts ok");
