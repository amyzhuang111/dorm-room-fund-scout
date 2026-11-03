/**
 * Review-only Places connection. Default: offline plan, zero requests.
 * node scripts/enrich/review-google-places.mjs --input <company-seeds.json> --max-requests 10
 * Add --execute only after enabling Places API (New), restricting the server key,
 * and approving its billing/quota limits. Set GOOGLE_MAPS_API_KEY privately.
 * Persist only Place IDs plus our own input/review metadata. No Google addresses,
 * coordinates, or raw responses are saved or imported into the MapLibre globe.
 * Open the generated Google Maps links to review candidates. A matching domain
 * is not proof of HQ occupancy: independently source an address before publishing.
 * https://developers.google.com/maps/documentation/places/web-service/policies
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function host(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, '') : null; } catch { return null; }
}
const sharedHosts = new Set(['linkedin.com','ycombinator.com','crunchbase.com','facebook.com','instagram.com','github.com','notion.site','sites.google.com']);
export function reviewPlan(seeds, limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('max-requests must be an integer from 1 to 100');
  const seen = new Set();
  return seeds.flatMap(seed => {
    const domain = host(seed.website_url);
    const city = typeof seed.hq === 'string' ? seed.hq : seed.hq?.value_text;
    if (!seed.id || seen.has(seed.id) || !seed.name?.trim() || !city?.trim() || !domain || [...sharedHosts].some(h => domain === h || domain.endsWith('.'+h))) return [];
    seen.add(seed.id);
    return [{ projectId: seed.id, company: seed.name.trim(), city: city.trim(), domain,
      query: `${seed.name.trim()} ${city.trim()} ${domain}` }];
  }).slice(0, limit);
}

export async function reviewPlaces(plan, { execute = false, apiKey, fetchImpl = fetch } = {}) {
  if (!execute) return { mode: 'offline-plan', requests: 0, records: plan.map(row => ({...row, status: 'not_checked', googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.query)}`})) };
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured. No requests sent.');
  if (plan.length > 100) throw new Error('Maximum batch size is 100 requests');
  const records = [];
  for (const row of plan) {
    const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.websiteUri,places.businessStatus' },
      body: JSON.stringify({ textQuery: row.query, pageSize: 10 }), signal: AbortSignal.timeout(15000),
    });
    // Do not log response bodies, headers or credentials on failure. No paid retries.
    if (!response.ok) throw new Error(`Google Places request failed (${response.status}); stopped after ${records.length + 1} request(s).`);
    const payload = await response.json();
    const matches = (payload.places ?? []).filter(place => host(place.websiteUri) === row.domain && place.businessStatus === 'OPERATIONAL' && typeof place.id === 'string' && /^[A-Za-z0-9_-]+$/.test(place.id));
    const placeIds = [...new Set(matches.map(place => place.id))];
    records.push({ ...row, status: placeIds.length > 1 ? 'ambiguous_manual_review' : placeIds.length ? 'domain_match_manual_review' : 'no_domain_match',
      placeIds, googleMapsUrls: placeIds.map(id => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.query)}&query_place_id=${encodeURIComponent(id)}`) });
  }
  return { mode: 'review_only', requests: records.length, records };
}

async function main() {
  const args = process.argv.slice(2);
  let input, output = 'reviews/google-place-candidates.json', limit = 10, execute = false;
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--execute') execute=true;
    else if (args[i]==='--input') input=args[++i];
    else if (args[i]==='--out') output=args[++i];
    else if (args[i]==='--max-requests') limit=Number(args[++i]);
    else throw new Error('Unknown option: '+args[i]);
  }
  if (!input) throw new Error('--input is required (id, name, website_url, hq). Default mode makes no API calls.');
  if (!output || path.basename(output) !== 'google-place-candidates.json') throw new Error('Output must be named google-place-candidates.json; existing address data is never updated.');
  const seeds=JSON.parse(fs.readFileSync(input,'utf8'));
  if (!Array.isArray(seeds)) throw new Error('Input must be an array of company records');
  const result=await reviewPlaces(reviewPlan(seeds,limit),{execute,apiKey:process.env.GOOGLE_MAPS_API_KEY});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n');
  console.log(`${result.mode}: ${result.requests} API requests, ${result.records.length} companies. No company data changed. Review: ${output}`);
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
