import assert from "node:assert/strict";
import { parsePersonList, parseVipXHtml } from "./hotspot-members";

const listed = parsePersonList("Chris Stolte WEMBA'25, Scott Ogden WEMBA'25, Mandy Chen WEMBA'25");
assert.equal(listed.length, 3);
assert.equal(listed[0].name, "Chris Stolte");
assert.deepEqual(listed[0].classYears, ["WEMBA'25"]);

const attached = parsePersonList("Mathieu Perez, SEAS'24");
assert.equal(attached.length, 1);
assert.equal(attached[0].name, "Mathieu Perez");
assert.deepEqual(attached[0].classYears, ["SEAS'24"]);

const ampersand = parsePersonList("Tara Townsend, W'04 & Elainea de Vera");
assert.equal(ampersand.length, 2);
assert.equal(ampersand[0].name, "Tara Townsend");
assert.deepEqual(ampersand[0].classYears, ["W'04"]);
assert.equal(ampersand[1].name, "Elainea de Vera");

const html = `
<div class="PromoAccordion">
  <div class="PromoAccordion-title">Fall 2024</div>
  <ul><li>Horus Health: billing tools. (Akhil Peddikuppa C'27)</li></ul>
  <ul><li>GoodRun: a digital home. (Brandon Huang (WG'25))</li></ul>
  <ul><li>Nirby soil analytics. Founder: Piotr Lazarek (ENG'25, W'25)</li></ul>
</div>
<div class="PromoEventWithImage">
  <div class="PromoEventWithImage-title">Adara Rituals</div>
  <div class="PromoEventWithImage-description"><i>Tara Townsend, W'04 &amp; Elainea de Vera</i></div>
</div>`;
const parsed = parseVipXHtml(html);
assert.equal(parsed.find((row) => row.name === "Akhil Peddikuppa")?.classYears[0], "C'27");
assert.equal(parsed.find((row) => row.name === "Akhil Peddikuppa")?.section, "Fall 2024");
assert.equal(parsed.find((row) => row.name === "Brandon Huang")?.classYears[0], "WG'25");
assert.deepEqual(parsed.find((row) => row.name === "Piotr Lazarek")?.classYears, ["ENG'25", "W'25"]);
assert.equal(parsed.find((row) => row.name === "Tara Townsend")?.company, "Adara Rituals");
assert.equal(parsed.some((row) => row.name === "Horus Health"), false);

console.log("hotspot-members tests passed");
