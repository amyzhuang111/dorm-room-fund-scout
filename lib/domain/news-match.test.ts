// News matcher, classifier, and RSS parser. No database and no network.

import assert from "node:assert/strict";
import { parseRss } from "./news-rss";
import { classifySourceType } from "./news-types";
import {
  articleKey,
  classifyCategory,
  domainNeedles,
  isAmbiguousName,
  isCommonNamePair,
  matchArticle,
  schoolPhrases,
  urlKey,
  type NewsEntity,
} from "./news-match";

const thirdlayer: NewsEntity = {
  projectId: "proj_thirdlayer",
  names: ["Thirdlayer"],
  founders: [{ personId: "person_kevin", name: "Kevin Gu" }],
  schoolPhrases: ["UC Berkeley", "Berkeley", "University of California, Berkeley"],
  domains: ["thirdlayer.inc", "thirdlayer"],
};

const lance: NewsEntity = {
  projectId: "proj_lance",
  names: ["Lance"],
  founders: [{ personId: "person_caleb", name: "Caleb Chan" }],
  schoolPhrases: ["Berkeley", "UC Berkeley"],
  domains: ["lance.live"],
};

const sim: NewsEntity = {
  projectId: "proj_sim",
  names: ["Sim"],
  founders: [{ personId: "person_emir", name: "Emir Karabeg" }],
  schoolPhrases: ["Berkeley"],
  domains: ["sim.ai"],
};

const common: NewsEntity = {
  projectId: "proj_acme",
  names: ["Acme"],
  founders: [{ personId: "person_john", name: "John Smith" }],
  schoolPhrases: ["Penn", "University of Pennsylvania"],
  domains: ["acme.example"],
};

assert.equal(isAmbiguousName("Thirdlayer"), false);
assert.equal(isAmbiguousName("Lance"), true);
assert.equal(isAmbiguousName("Sim"), true);
assert.equal(isAmbiguousName("Human Behavior"), false);
assert.equal(isCommonNamePair("John Smith"), true);
assert.equal(isCommonNamePair("Kevin Gu"), false);
assert.equal(isCommonNamePair("Caleb Chan"), false);

const named = matchArticle(
  "Thirdlayer raises $4 million seed",
  "Kevin Gu, a UC Berkeley founder, started Thirdlayer.",
  [thirdlayer, lance]
);
assert.equal(named.length, 1);
assert.equal(named[0]?.confidence, "high");
assert.deepEqual(named[0]?.personIds, ["person_kevin"]);
assert.equal(classifyCategory("Thirdlayer raises $4 million seed", ""), "funding");

const schoolOnly = matchArticle("Thirdlayer is a Berkeley startup", "Students at Berkeley built it.", [thirdlayer]);
assert.equal(schoolOnly[0]?.confidence, "low");
assert.deepEqual(schoolOnly[0]?.personIds, []);

const domainOnly = matchArticle("Thirdlayer opens its API", "See thirdlayer.inc for the docs.", [thirdlayer]);
assert.equal(domainOnly[0]?.confidence, "medium");

const unrelated = matchArticle(
  "Live-in offices and stacks of ramen: inside founder apartments",
  "Six young founders in San Francisco described their rent.",
  [thirdlayer, lance, sim]
);
assert.equal(unrelated.length, 0);

const ambiguousSchool = matchArticle("Lance is hiring in Berkeley", "The Berkeley team is growing.", [lance]);
assert.equal(ambiguousSchool.length, 0);

const ambiguousFounder = matchArticle("Lance launches with Caleb Chan", "Caleb Chan built Lance at Berkeley.", [lance]);
assert.equal(ambiguousFounder[0]?.confidence, "high");
assert.equal(classifyCategory("Lance launches with Caleb Chan", ""), "launch");

const simSchool = matchArticle("Sim expands at Berkeley", "A Berkeley class project called Sim.", [sim]);
assert.equal(simSchool.length, 0);

const simDomain = matchArticle("Sim ships a new agent", "The product is at sim.ai.", [sim]);
assert.equal(simDomain[0]?.confidence, "medium");

const commonAlone = matchArticle("Acme and John Smith", "John Smith joined Acme last year.", [common]);
assert.equal(commonAlone.length, 0);

const commonSchool = matchArticle("Acme at Penn", "University of Pennsylvania students and John Smith run Acme.", [common]);
assert.equal(commonSchool[0]?.confidence, "medium");

const acquired = matchArticle("Thirdlayer acquired by a public company", "Kevin Gu confirmed the acquisition.", [thirdlayer]);
assert.equal(classifyCategory(acquired.length ? "Thirdlayer acquired by a public company" : "", ""), "acquisition");

const award = classifyCategory("Kevin Gu named to the Forbes 30 under 30", "Profile of the Thirdlayer founder.");
assert.equal(award, "award");

const profile = classifyCategory("A conversation with the founder", "Interview: how I built the product.");
assert.equal(profile, "profile");

const roundup = Array.from({ length: 9 }, (_, index) => ({
  projectId: `proj_${index}`,
  names: [`Brand${index}labs`],
  founders: [],
  schoolPhrases: ["Stanford"],
  domains: [],
}));
const roundupText = roundup.map((entity) => `${entity.names[0]} at Stanford`).join(". ");
assert.equal(matchArticle(roundupText, "", roundup).length, 0);

assert.deepEqual(schoolPhrases({ name: "University of Pennsylvania", shortLabel: "Penn", aliases: ["UPenn", "Cal"] }), [
  "University of Pennsylvania",
  "Penn",
  "UPenn",
]);
assert.ok(schoolPhrases({ shortLabel: "MIT", aliases: ["MIT"] }).includes("MIT"));
assert.deepEqual(domainNeedles("https://www.lance.live/path"), ["lance.live"]);
assert.deepEqual(domainNeedles("https://appliedkinetics.ai"), ["appliedkinetics.ai", "appliedkinetics"]);
assert.deepEqual(domainNeedles("https://www.linkedin.com/company/acme"), []);
assert.deepEqual(domainNeedles("https://sim.ai"), ["sim.ai"]);

assert.equal(urlKey("https://www.Example.com/story/?utm_source=rss&id=7"), "example.com/story?id=7");
assert.equal(
  articleKey({
    url: "https://news.google.com/rss/articles/abc",
    headline: "Thirdlayer raises a seed round",
    sourceName: "TechCrunch",
    publishedAt: "2026-09-21T00:00:00.000Z",
  }),
  articleKey({
    url: "https://techcrunch.com/2026/09/21/thirdlayer",
    headline: "Thirdlayer raises a seed round",
    sourceName: "TechCrunch",
    publishedAt: "2026-09-21T15:00:00.000Z",
  })
);

const rss = parseRss(`<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[Thirdlayer raises $4M]]></title>
  <link>https://example.com/thirdlayer?utm_source=rss</link>
  <pubDate>Sun, 21 Sep 2026 07:00:00 GMT</pubDate>
  <description>&lt;a href="https://example.com/thirdlayer"&gt;Thirdlayer raises $4M&lt;/a&gt; &amp;nbsp; TechCrunch</description>
  <source url="https://techcrunch.com">TechCrunch</source>
</item></channel></rss>`);
assert.equal(rss.length, 1);
assert.equal(rss[0]?.title, "Thirdlayer raises $4M");
assert.equal(rss[0]?.sourceName, "TechCrunch");
assert.equal(rss[0]?.publishedAt, "2026-09-21T07:00:00.000Z");
assert.equal(rss[0]?.snippet, "");

const central: NewsEntity = {
  projectId: "proj_central",
  names: ["Central"],
  founders: [],
  schoolPhrases: ["University of Pennsylvania", "Penn"],
  domains: ["centralhq.com"],
};
assert.equal(matchArticle("This Central High School rower excelled at University of Pennsylvania", "", [central]).length, 0);
assert.equal(matchArticle("IUP Football National Signing Day Central", "Indiana University of Pennsylvania Athletics", [central]).length, 0);
assert.equal(matchArticle("Central raises a seed round", "The product is at centralhq.com.", [central])[0]?.confidence, "medium");

const cursorCo: NewsEntity = {
  projectId: "proj_cursor",
  names: ["Cursor"],
  founders: [],
  schoolPhrases: ["MIT"],
  domains: [],
};
assert.equal(matchArticle("Voice app pastes text at your cursor", "A free open-source (MIT) macOS menu-bar app.", [cursorCo]).length, 0);

const whisperKit: NewsEntity = {
  projectId: "proj_whisper",
  names: ["WhisperKit"],
  founders: [],
  schoolPhrases: ["MIT", "Massachusetts Institute of Technology"],
  domains: [],
};
assert.equal(matchArticle("WhisperKit is an open-source (MIT) dictation app", "", [whisperKit]).length, 0);
assert.equal(matchArticle("WhisperKit, an MIT startup, launches on macOS", "", [whisperKit])[0]?.confidence, "low");

const atla: NewsEntity = {
  projectId: "proj_atla",
  names: ["Atla"],
  founders: [],
  schoolPhrases: [],
  domains: ["atla-ai.com", "atla-ai"],
};
assert.equal(matchArticle("Map downloader for aerial data", "The app is at https://atla.ai", [atla]).length, 0);
assert.equal(matchArticle("Atla launches a map tool", "Available at atla-ai.com.", [atla])[0]?.confidence, "medium");

const porta: NewsEntity = {
  projectId: "proj_porta",
  names: ["PortaDash"],
  founders: [],
  schoolPhrases: ["Penn", "University of Pennsylvania"],
  domains: [],
};
assert.equal(matchArticle("Penn Engineering student launches PortaDash", "The app maps public restrooms.", [porta])[0]?.confidence, "low");

const dossier: NewsEntity = {
  projectId: "proj_dossier",
  names: ["Dossier"],
  founders: [],
  schoolPhrases: ["UPenn", "University of Pennsylvania"],
  domains: [],
};
assert.equal(matchArticle("UPenn students’ disturbing dossier exposes antisemitism on campus", "", [dossier]).length, 0);

const spring: NewsEntity = {
  projectId: "proj_spring",
  names: ["Spring"],
  founders: [],
  schoolPhrases: ["University of Pennsylvania", "Penn"],
  domains: [],
};
assert.equal(matchArticle("Heavies Open Spring Racing Saturday vs. Northeastern", "University of Pennsylvania Athletics", [spring]).length, 0);

const cervi: NewsEntity = {
  projectId: "proj_cervi",
  names: ["CerviCheck"],
  founders: [],
  schoolPhrases: ["Cornell", "Cornell University"],
  domains: [],
};
assert.equal(matchArticle("Engineering Change: CerviCheck’s Mission for Predicting Preterm Birth", "The Cornell Daily Sun", [cervi])[0]?.confidence, "low");

const atom = parseRss(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>PortaDash launch thread</title>
  <link rel="alternate" href="https://www.reddit.com/r/startups/comments/abc/portadash"/>
  <published>2026-04-01T12:00:00+00:00</published>
  <content type="html">Penn Engineering student launches PortaDash</content>
</entry></feed>`);
assert.equal(atom.length, 1);
assert.equal(atom[0]?.link, "https://www.reddit.com/r/startups/comments/abc/portadash");
assert.equal(atom[0]?.publishedAt, "2026-04-01T12:00:00.000Z");

assert.equal(classifySourceType({ feed: "campus_press", sourceName: "The Tech", url: "https://thetech.com/a", title: "A" }), "campus_paper");
assert.equal(classifySourceType({ feed: "google_news", sourceName: "The Harvard Crimson", url: "https://news.google.com/x", title: "Mercor" }), "campus_paper");
assert.equal(classifySourceType({ feed: "press_release", sourceName: "PR Newswire", url: "https://www.prnewswire.com/a", title: "raises" }), "press_release");
assert.equal(classifySourceType({ feed: "product_hunt", sourceName: "Product Hunt", url: "https://www.producthunt.com/posts/a", title: "A" }), "launch");
assert.equal(classifySourceType({ feed: "hacker_news", sourceName: "Hacker News", url: "https://news.ycombinator.com/item?id=1", title: "Launch HN: Ada" }), "launch");
assert.equal(classifySourceType({ feed: "hacker_news", sourceName: "Hacker News", url: "https://news.ycombinator.com/item?id=2", title: "Ask HN: tools" }), "social");
assert.equal(classifySourceType({ feed: "x", sourceName: "X", url: "https://news.google.com/rss/articles/abc", title: "We launched - x.com" }), "social");
assert.equal(classifySourceType({ feed: "company_blog", sourceName: "Mercor blog", url: "https://mercor.com/feed", title: "Series B" }), "press");
assert.equal(classifySourceType({ feed: "techcrunch", sourceName: "TechCrunch", url: "https://techcrunch.com/a", title: "raises" }), "press");

const exchange: NewsEntity = {
  projectId: "proj_o1",
  names: ["o1.exchange"],
  founders: [],
  schoolPhrases: [],
  domains: ["o1.exchange", "exchange"],
};
assert.equal(matchArticle("Congratulations @o1_exchange on the launch", "", [exchange]).length, 0);
assert.equal(matchArticle("Building on Base: o1.exchange and Builder Codes", "", [exchange])[0]?.reason, "o1.exchange + domain o1.exchange");

console.log("news-match tests passed");
