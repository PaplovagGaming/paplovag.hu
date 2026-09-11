import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/paplovag-showcase-v3.js',import.meta.url),'utf8');
function setup(fetch){const c=vm.createContext({fetch,URL,URLSearchParams,Response,AbortSignal,console,Intl});vm.runInContext(source.replaceAll('export async function','async function'),c);return c;}
const channel='UCUEDPQyLPN5lrTH06k2oWYA';
const videos=Array.from({length:8},(_,i)=>({id:`v${i}`,snippet:{channelId:channel,publishedAt:`2023-01-${String(i+1).padStart(2,'0')}T12:00:00Z`,liveBroadcastContent:'none',title:`Video ${i}`},status:{privacyStatus:'public'},contentDetails:{duration:'PT30S'}}));
test('playlist pagination includes old Shorts and sorts by publication date',async()=>{
  let pages=0;
  const c=setup(url=>{const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');assert.equal(u.searchParams.get('playlistId'),'PLrH3C01Hh-gmsL1RGeAu-0r4viY6vnA91');pages++;return new Response(JSON.stringify(u.searchParams.has('pageToken')?{items:videos.slice(4).map(v=>({contentDetails:{videoId:v.id}}))}:{items:videos.slice(0,4).map(v=>({contentDetails:{videoId:v.id}})),nextPageToken:'next'}));});
  c.videoDetails=async(token,ids)=>videos.filter(v=>ids.includes(v.id));
  const result=await c.latestShorts('token');
  assert.deepEqual(Array.from(result.items,v=>v.id),['v7','v6','v5','v4','v3']);
  assert.equal(pages,2);assert.equal(result.method,'curated_shorts_playlist');
});
test('private, foreign and livestream entries are excluded',async()=>{
  const c=setup(()=>new Response(JSON.stringify({items:videos.map(v=>({contentDetails:{videoId:v.id}}))})));
  const items=structuredClone(videos);items[7].status.privacyStatus='private';items[6].snippet.channelId='other';items[5].liveStreamingDetails={actualStartTime:'2023-01-01'};
  c.videoDetails=async()=>items;
  assert.deepEqual(Array.from((await c.latestShorts('token')).items,v=>v.id),['v4','v3','v2','v1','v0']);
});
test('playlist errors preserve previous Shorts and concrete Google error',async()=>{
  const c=setup(()=>new Response(JSON.stringify({error:{message:'Playlist not found'}}),{status:404}));
  const status={},errors={},previous={items:[{id:'previous'}]};
  assert.equal(await c.safeSection('shorts',()=>c.latestShorts('token'),previous,status,errors),previous);
  assert.equal(status.shorts,'error');assert.match(errors.shorts,/Playlist not found/);
});
test('Shorts-only build needs no uploads playlist or Analytics and skips other sections',async()=>{
  const c=setup();c.getAccessToken=async()=> 'token';c.decryptRefreshToken=async()=> 'refresh';c.googleJson=async()=>({items:[{id:channel,snippet:{publishedAt:'2013-01-01'}}]});
  c.latestShorts=async()=>({items:[{id:'new'}]});c.lifetimeTop=c.playlistSection=()=>{throw new Error('Other section must not run');};
  const writes=[];const kv={get:async()=>({}),put:async(key)=>writes.push(key)};
  const result=await c.build({YOUTUBE_OAUTH_CLIENT_ID:'id',YOUTUBE_OAUTH_CLIENT_SECRET:'secret',MEDIA_KIT_ADMIN_PASSWORD:'test'},kv,null,'shorts','shorts-cache');
  assert.equal(result.shorts[0].id,'new');assert.equal(result.sectionStatus.shorts,'ok');assert.equal(result.sectionStatus.tech,undefined);assert.deepEqual(writes,['shorts-cache']);
});
