import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/paplovag-showcase-v3.js',import.meta.url),'utf8');
function setup(fetch){const c=vm.createContext({fetch,URL,URLSearchParams,Response,AbortSignal,console,Intl});vm.runInContext(source.replace('export async function','async function'),c);return c;}
const videos=Array.from({length:8},(_,i)=>({id:`v${i}`,snippet:{publishedAt:`2026-09-${String(10-i).padStart(2,'0')}T12:00:00Z`,liveBroadcastContent:'none',title:`Video ${i}`},status:{privacyStatus:'public'},contentDetails:{duration:'PT30S'},fileDetails:{videoStreams:[{widthPixels:1080,heightPixels:1920}]}}));
test('one batched Analytics request and newest upload wins even without Analytics data',async()=>{
  let count=0;
  const c=setup(url=>{count++;const u=new URL(url);assert.equal(u.searchParams.get('dimensions'),'video,creatorContentType');assert.equal(u.searchParams.get('filters').split(',').length,8);return new Response(JSON.stringify({columnHeaders:[{name:'video'},{name:'creatorContentType'}],rows:videos.slice(1).map(v=>[v.id,'SHORTS'])}));});
  c.recentUploadIds=async()=>videos.map(v=>v.id);
  c.videoDetails=async(token,ids)=>videos.filter(v=>ids.includes(v.id));
  const result=await c.latestShorts('token','uploads','2013-01-01','2026-09-09');
  assert.deepEqual(Array.from(result.items,v=>v.id),['v0','v1','v2','v3','v4']);
  assert.equal(count,1);
});
test('both classification failures propagate and preserve the previous Shorts list',async()=>{
  const c=setup(()=>new Response(JSON.stringify({error:{message:'Google quota exhausted'}}),{status:429}));
  c.recentUploadIds=async()=>videos.map(v=>v.id);
  c.videoDetails=async(token,ids,parts)=>{if(parts?.includes('fileDetails'))throw new Error('fileDetails forbidden');return videos;};
  const status={},errors={},previous={items:[{id:'previous'}]};
  const result=await c.safeSection('shorts',()=>c.latestShorts('token','uploads','2013-01-01','2026-09-09'),previous,status,errors);
  assert.equal(result,previous);assert.equal(status.shorts,'error');assert.match(errors.shorts,/Google quota exhausted/);
});
test('square, rotated, long and older uploads use appropriate Shorts dimensions and duration',()=>{
  const c=setup();
  const item=structuredClone(videos[0]);item.fileDetails.videoStreams[0].heightPixels=1080;item.contentDetails.duration='PT3M';assert.equal(c.portraitFromFileDetails(item),true);
  item.snippet.publishedAt='2023-01-01';assert.equal(c.portraitFromFileDetails(item),false);
  item.contentDetails.duration='PT30S';item.fileDetails.videoStreams[0]={widthPixels:1920,heightPixels:1080};assert.equal(c.portraitFromFileDetails(item),false);
  item.fileDetails.videoStreams[0].rotation='clockwise';assert.equal(c.portraitFromFileDetails(item),true);
});
test('Shorts-only build never starts Tech/Gaming/top work and uses its own cache key',async()=>{
  const c=setup();c.getAccessToken=async()=> 'token';c.decryptRefreshToken=async()=> 'refresh';c.googleJson=async()=>({items:[{id:'UCUEDPQyLPN5lrTH06k2oWYA',snippet:{publishedAt:'2013-01-01'},contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]});
  c.latestShorts=async()=>({items:[{id:'new'}]});c.lifetimeTop=c.playlistSection=()=>{throw new Error('Other section must not run');};
  const writes=[];const kv={get:async()=>({}),put:async(key)=>writes.push(key)};
  const result=await c.build({YOUTUBE_OAUTH_CLIENT_ID:'id',YOUTUBE_OAUTH_CLIENT_SECRET:'secret',MEDIA_KIT_ADMIN_PASSWORD:'test'},kv,null,'shorts','shorts-cache');
  assert.equal(result.shorts[0].id,'new');assert.equal(result.sectionStatus.shorts,'ok');assert.equal(result.sectionStatus.tech,undefined);assert.deepEqual(writes,['shorts-cache']);
});
