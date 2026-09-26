// Unknown-sweep parsers. No database and no network.

import assert from "node:assert/strict";
import {
  announcedRaiseIn,
  companyLinkedInIn,
  excerptNamesCompany,
  foundedYearIn,
  headquartersExcerptOk,
  headquartersIn,
  labeledOfficialWebsite,
  preferOfficialWebsite,
  schoolHitsInPersonExcerpt,
  teamSizeIn,
} from "./unknown-sweep";

const berkeleyBio =
  "Y Combinator's page for tash lists Victor Shammas (Founder/CPO) as a founder. Bio: \"UC Berkeley Business & Data Science, Co-Founder @ tash.\"";
assert.equal(schoolHitsInPersonExcerpt(berkeleyBio)[0]?.universityId, "univ_berkeley");

const coauthor = "Co-author of StarCoder with Stanford University researchers on the paper.";
assert.equal(schoolHitsInPersonExcerpt(coauthor).length, 0);

const customer = "The product is already using University of Pennsylvania hospitals as a pilot site.";
assert.equal(schoolHitsInPersonExcerpt(customer).length, 0);

const studied = "She studied computer science at Stanford University before starting the company.";
assert.equal(schoolHitsInPersonExcerpt(studied)[0]?.universityId, "univ_stanford");

const mitSpinout =
  "Y Combinator's page lists Frankie Li as a founder. Bio: \"Previously led product at Fundamental Research Labs (a16z-backed, MIT spinout). Harvard Grad.\"";
assert.equal(
  schoolHitsInPersonExcerpt(mitSpinout, { personName: "Frankie Li", claimType: "accelerator_founder" }).map((hit) => hit.universityId).join(","),
  "univ_harvard",
);
const employerList =
  "Bio: \"Previously Tesla, SpaceX, Columbia University, Princeton Plasma Physics Laboratory.\"";
assert.equal(schoolHitsInPersonExcerpt(employerList, { claimType: "accelerator_founder" }).length, 0);
const workedAt =
  "Bio: \"Worked on AI @ Johns Hopkins, MIT, and TikTok.\"";
assert.equal(schoolHitsInPersonExcerpt(workedAt, { claimType: "accelerator_founder" }).length, 0);
const unverified = "Unverified LinkedIn candidate. Snippet: Computer Science @ Carnegie Mellon University. school and company did not.";
assert.equal(schoolHitsInPersonExcerpt(unverified, { personName: "Ian Shi", claimType: "linkedin_candidate" }).length, 0);
const devfest = "Alexander Dong won two tracks at Columbia University's Devfest.";
assert.equal(schoolHitsInPersonExcerpt(devfest, { personName: "Alexander Dong", claimType: "linkedin_alias_discovered" }).length, 0);
const otherPerson = "Need That was founded by Wharton student Patrick Sippel and Lehigh University student Lorcan Cheng.";
assert.equal(schoolHitsInPersonExcerpt(otherPerson, { personName: "Lorcan Cheng", claimType: "linkedin_alias_discovered" }).length, 0);

assert.equal(foundedYearIn("We were founded in 2019 and incorporated the next spring.")?.year, 2019);
assert.equal(foundedYearIn("Founded in 2014. The lab was founded in 2018."), null);

assert.equal(headquartersIn("The company is headquartered in San Francisco, CA and ships nationwide.")?.place, "San Francisco, CA");
assert.equal(headquartersIn("Based in Boston. Also based in Austin."), null);
assert.equal(headquartersIn("Based in our research lab."), null);

assert.equal(companyLinkedInIn(["https://www.linkedin.com/company/chef-robotics/", "https://linkedin.com/company/chef-robotics"]), "https://www.linkedin.com/company/chef-robotics");
assert.equal(companyLinkedInIn(["https://www.linkedin.com/company/acme", "https://www.linkedin.com/company/other"]), null);
assert.equal(companyLinkedInIn(["https://www.linkedin.com/company/share"]), null);

assert.equal(teamSizeIn("A team of 12 people builds the product.")?.size, 12);
assert.equal(teamSizeIn("A team of 12. Later, a team of 40."), null);

const raise = announcedRaiseIn("In 2024 the company raised $6 million seed from campus angels.");
assert.equal(raise?.amountUsd, 6_000_000);
assert.equal(raise?.stage, "Seed");
assert.equal(announcedRaiseIn("Previously raised $2M at a prior company. This company raised $6M seed."), null);
assert.equal(announcedRaiseIn("They raised $1M and later raised $4M."), null);
assert.equal(announcedRaiseIn("The new round comes after it raised $5.3 million in seed funding."), null);
assert.equal(announcedRaiseIn("The company raised $4.5 million and also raises $15 million."), null);
assert.equal(companyLinkedInIn(["https://www.linkedin.com/company/techcrunch"]), null);

assert.equal(
  labeledOfficialWebsite([
    { text: "About", href: "https://www.grasp.upenn.edu/about/" },
    { text: "Website", href: "https://www.chefrobotics.ai/" },
  ]),
  "https://www.chefrobotics.ai",
);
assert.equal(
  labeledOfficialWebsite([
    { text: "Website", href: "https://www.grasp.upenn.edu/startups/chef-robotics/" },
    { text: "Website", href: "https://www.chefrobotics.ai/" },
  ]),
  "https://www.chefrobotics.ai",
);
assert.equal(
  labeledOfficialWebsite([
    { text: "Website", href: "https://one.example/" },
    { text: "Website", href: "https://two.example/" },
  ]),
  null,
);

assert.deepEqual(preferOfficialWebsite("https://yprize.upenn.edu/", "https://serpentrobotics.com"), {
  website: "https://serpentrobotics.com",
  primary: "https://yprize.upenn.edu/",
});
assert.equal(preferOfficialWebsite("https://skypilot.ai", "https://skypilot.ai/about"), null);

assert.equal(excerptNamesCompany("Phia is headquartered in New York City", "Phia"), true);
assert.equal(excerptNamesCompany("ERA is a leading tech accelerator based in New York city.", "Woveon"), false);
assert.equal(headquartersExcerptOk("We're based in Austin and hiring.", "Acme"), true);
assert.equal(excerptNamesCompany("Founded in 2011, the Thiel Fellowship is designed", "Cavalla"), false);

console.log("unknown-sweep tests passed");
