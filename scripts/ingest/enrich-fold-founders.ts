/**
 * One-shot enrichment already applied to data/campus-universe.db for fold-visible gaps.
 * Sources are public pages that name the person with the company and school.
 * LinkedIn URLs are stored only when a public source ties that URL to the person.
 * Re-running is safe: inserts skip existing roles and replace linkedin aliases in place.
 */
console.log("Fold founder enrichment lives in data/campus-universe.db (Huagang Tan, Jason Li, Coveted, Miirror, Vivek Olumbe Penn affiliation).");
