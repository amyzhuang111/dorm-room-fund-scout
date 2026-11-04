import assert from 'node:assert/strict';
import { reviewPlan, reviewPlaces } from './review-google-places.mjs';
const seed={id:'test',name:'Example',website_url:'https://www.example.com',hq:{value_text:'San Francisco'}};
assert.throws(()=>reviewPlan([seed],101));
assert.equal(reviewPlan([seed,seed,{...seed,id:'missing-city',hq:null},{...seed,id:'directory',website_url:'https://www.linkedin.com/company/example'}],10).length,1);
const plan=reviewPlan([seed],1);
let requests=0;
const offline=await reviewPlaces(plan,{fetchImpl:()=>{throw Error('Offline mode made a request');}});
assert.equal(offline.requests,0);
await assert.rejects(reviewPlaces(plan,{execute:true}),/not configured/);
const result=await reviewPlaces(plan,{execute:true,apiKey:'test-only-placeholder',fetchImpl:async(url,options)=>{
  requests++;
  assert.equal(url,'https://places.googleapis.com/v1/places:searchText');
  assert(!options.headers['X-Goog-FieldMask'].includes('location'));
  return {ok:true,json:async()=>({places:[
    {id:'wrong',websiteUri:'https://example.com.evil.test',businessStatus:'OPERATIONAL'},
    {id:'closed',websiteUri:'https://example.com',businessStatus:'CLOSED_PERMANENTLY'},
    {id:'one',websiteUri:'https://example.com',businessStatus:'OPERATIONAL',formattedAddress:'Never persist',location:{latitude:1}},
    {id:'two',websiteUri:'https://www.example.com',businessStatus:'OPERATIONAL'},
  ]})};
}});
assert.equal(requests,1);
assert.equal(result.records[0].status,'ambiguous_manual_review');
assert.deepEqual(result.records[0].placeIds,['one','two']);
assert(!JSON.stringify(result).includes('Never persist'));
assert(!JSON.stringify(result).includes('test-only-placeholder'));
let failures=0;
await assert.rejects(reviewPlaces([...plan,...plan],{execute:true,apiKey:'test-only-placeholder',fetchImpl:async()=>{failures++;return {ok:false,status:429};}}),/429/);
assert.equal(failures,1,'No retries or next request after quota failure');
console.log('PASS: offline mode, request limits, exact company domain, closed/ambiguous matches, no Google coordinates persisted, no paid retries');
