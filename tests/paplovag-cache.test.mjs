import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/paplovag-showcase-v3.js',import.meta.url),'utf8');
function setup(){const c=vm.createContext({URL,URLSearchParams,Request,Response,AbortSignal,console,Intl,fetch(){throw new Error('Visitor request must never call YouTube');}});vm.runInContext(source.replaceAll('export async function','async function'),c);return c;}
function kv(entries={}){const values=new Map(Object.entries(entries));const writes=[];return {values,writes,async get(k){return structuredClone(values.get(k)||null);},async put(k,v,options){values.set(k,JSON.parse(v));writes.push({k,options});}};}
const old={version:8,shorts:[{id:'saved'}],sectionStatus:{shorts:'ok'},updatedAt:'2026-01-01T00:00:00Z'};
test('expired snapshot is returned immediately without YouTube, even with refresh=1',async()=>{
 const c=setup();c.verifySession=async()=>true;const store=kv({'paplovag-youtube-showcase-v9:shorts':old});
 const response=await c.onRequestGet({request:new Request('https://paplovag.hu/api/paplovag-showcase?section=shorts&refresh=1'),env:{MEDIA_KIT_PASSWORD:'test',MEDIA_KIT_KV:store}});
 const result=await response.json();assert.equal(response.status,200);assert.equal(result.shorts[0].id,'saved');assert.equal(result.stale,true);assert.equal(store.writes.length,0);
});
test('legacy cache migrates without expiration and cache miss never blocks on YouTube',async()=>{
 const c=setup();c.verifySession=async()=>true;const store=kv({'paplovag-youtube-showcase-v8:shorts':old});
 let response=await c.onRequestGet({request:new Request('https://paplovag.hu/api/paplovag-showcase?section=shorts'),env:{MEDIA_KIT_PASSWORD:'test',MEDIA_KIT_KV:store}});
 assert.equal((await response.json()).shorts[0].id,'saved');assert.equal(store.writes[0].options,undefined);
 response=await c.onRequestGet({request:new Request('https://paplovag.hu/api/paplovag-showcase?section=top'),env:{MEDIA_KIT_PASSWORD:'test',MEDIA_KIT_KV:store}});
 assert.equal((await response.json()).sectionStatus.top,'pending');
});
test('public users cannot trigger refresh; cron secret can refresh one isolated section',async()=>{
 const c=setup();c.verifySession=async()=>false;const store=kv();const env={MEDIA_KIT_KV:store,MEDIA_KIT_CRON_SECRET:'secret'};
 assert.equal((await c.onRequestPost({request:new Request('https://paplovag.hu/api/paplovag-showcase?section=top',{method:'POST'}),env})).status,401);
 c.build=async(e,k,p,section)=>{assert.equal(section,'top');return {sectionStatus:{top:'ok'},sectionErrors:{},sectionUpdatedAt:{top:'now'}};};
 const response=await c.onRequestPost({request:new Request('https://paplovag.hu/api/paplovag-showcase?section=top',{method:'POST',headers:{Authorization:'Bearer secret'}}),env});
 assert.equal((await response.json()).ok,true);
});
test('failed background refresh retains saved videos and original successful timestamp',async()=>{
 const c=setup();c.getAccessToken=async()=> 'token';c.decryptRefreshToken=async()=> 'refresh';c.googleJson=async()=>({items:[{id:'UCUEDPQyLPN5lrTH06k2oWYA',snippet:{publishedAt:'2013-01-01'}}]});c.latestShorts=async()=>{throw new Error('Google unavailable');};
 const store=kv({'paplovag-youtube-oauth-refresh-token':{}});const previous={...old,sectionUpdatedAt:{shorts:old.updatedAt}};
 const result=await c.build({YOUTUBE_OAUTH_CLIENT_ID:'id',YOUTUBE_OAUTH_CLIENT_SECRET:'secret',MEDIA_KIT_ADMIN_PASSWORD:'test'},store,previous,'shorts','snapshot');
 assert.equal(result.shorts[0].id,'saved');assert.equal(result.sectionUpdatedAt.shorts,old.updatedAt);assert.equal(result.sectionStatus.shorts,'error');assert.equal(store.writes[0].options,undefined);
});
test('hourly cron refreshes all four video sections without running daily Analytics',async()=>{
 const code=await readFile(new URL('../cloudflare/media-kit-cron-worker.js',import.meta.url),'utf8');const calls=[];
 const c=vm.createContext({URL,Response,AbortSignal,Intl,console,fetch:async url=>{calls.push(url);return new Response(JSON.stringify({ok:true}));}});vm.runInContext(code.replace('export default {','globalThis.worker={'),c);
 let pending;await c.worker.scheduled({scheduledTime:Date.parse('2026-09-11T10:01:00Z')},{MEDIA_KIT_CRON_SECRET:'secret'},{waitUntil(p){pending=p;}});await pending;
 assert.equal(calls.length,4);assert.ok(calls.every(url=>url.includes('/paplovag-showcase?section=')));
});

