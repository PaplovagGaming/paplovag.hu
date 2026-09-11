import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const source=await readFile(new URL('../functions/api/paplovag-showcase-v3.js',import.meta.url),'utf8');
const channel='UCUEDPQyLPN5lrTH06k2oWYA';
function setup(){const c=vm.createContext({URL,URLSearchParams,Request,Response,TextEncoder,TextDecoder,crypto:webcrypto,btoa,atob,AbortSignal,console,Intl});vm.runInContext(source.replaceAll('export async function','async function'),c);return c;}
function mock(c,count=2334){
 let calls=0;
 c.getAccessToken=async()=> 'token';c.decryptRefreshToken=async()=> 'refresh';
 c.googleJson=async url=>{calls++;const u=new URL(url);if(u.pathname.endsWith('/channels'))return {items:[{id:channel}]};
  if(u.searchParams.get('playlistId')==='PLrH3C01Hh-gnG5Qs_Xwe3z2yxMFYSwFWh')return {items:[{contentDetails:{videoId:'v0'}}]};
  const start=Number(u.searchParams.get('pageToken')||0),end=Math.min(start+50,count);
  return {items:Array.from({length:end-start},(_,i)=>({contentDetails:{videoId:'v'+(start+i)}})),...(end<count?{nextPageToken:String(end)}:{})};};
 c.videoDetails=async(t,ids)=>{calls++;return ids.map(id=>({id,snippet:{channelId:channel,title:id==='v0'?'BOOX test':id,publishedAt:'2020-01-01T00:00:00Z'},status:{privacyStatus:'public'},statistics:{viewCount:id==='v0'?999999:Number(id.slice(1))}}));};
 return {reset(){calls=0;},calls(){return calls;}};
}
test('entire 2334-entry Gameplay playlist is ranked across bounded batches; tech is excluded',async()=>{
 const c=setup(),m=mock(c);let state=null,result,batches=0;
 do {m.reset();result=await c.playlistBatch('token','gaming',state);state=JSON.parse(JSON.stringify(result.work));assert.ok(m.calls()<=18);batches++;}while(!result.complete);
 assert.ok(batches>1);assert.equal(result.value.scannedVideos,2334);assert.equal(result.value.totalVideos,2333);assert.equal(result.value.excludedTechVideos,1);
 assert.deepEqual(Array.from(result.value.top,v=>v.id),['v2333','v2332','v2331']);
});
test('partial batches never publish; signed continuation completes one snapshot and rejects tampering',async()=>{
 const c=setup();mock(c);const writes=[];const kv={get:async()=>({}),put:async(k,v)=>writes.push(JSON.parse(v))};const env={MEDIA_KIT_ADMIN_PASSWORD:'test',YOUTUBE_OAUTH_CLIENT_ID:'id',YOUTUBE_OAUTH_CLIENT_SECRET:'secret'};
 let continuation;let result;
 do {const request=new Request('https://paplovag.hu/api/paplovag-showcase?section=gaming',{method:'POST',body:JSON.stringify({continuation})});result=await(await c.refreshPlaylist(request,env,kv,'gaming')).json();if(result.pending){assert.equal(writes.length,0);continuation=result.continuation;}}while(result.pending);
 assert.equal(writes.length,1);assert.equal(writes[0].gaming.scannedVideos,2334);
 await assert.rejects(c.refreshPlaylist(new Request('https://paplovag.hu/',{method:'POST',body:JSON.stringify({continuation:continuation+'x'})}),env,kv,'gaming'),/invalid_playlist_continuation/);
 await assert.rejects(c.refreshPlaylist(new Request('https://paplovag.hu/',{method:'POST',body:JSON.stringify({continuation})}),env,kv,'tech'),/wrong_playlist_continuation/);
});
test('late Google error leaves previous complete snapshot untouched',async()=>{
 const c=setup();mock(c,1200);const writes=[];const kv={get:async()=>({}),put:async(k,v)=>writes.push(v)};const env={MEDIA_KIT_ADMIN_PASSWORD:'test',YOUTUBE_OAUTH_CLIENT_ID:'id',YOUTUBE_OAUTH_CLIENT_SECRET:'secret'};
 const first=await(await c.refreshPlaylist(new Request('https://paplovag.hu/',{method:'POST'}),env,kv,'gaming')).json();
 c.videoDetails=async()=>{throw new Error('Google quotaExceeded');};
 await assert.rejects(c.refreshPlaylist(new Request('https://paplovag.hu/',{method:'POST',body:JSON.stringify({continuation:first.continuation})}),env,kv,'gaming'),/Google quotaExceeded/);assert.equal(writes.length,0);
});
test('cron follows continuation rather than treating an incomplete scan as finished',async()=>{
 const code=await readFile(new URL('../cloudflare/media-kit-cron-worker.js',import.meta.url),'utf8');const bodies=[];
 const c=vm.createContext({URL,Response,AbortSignal,Intl,console,fetch:async(url,opts)=>{bodies.push(opts.body);return new Response(JSON.stringify(bodies.length===1?{ok:true,pending:true,continuation:'signed-state'}:{ok:true,updatedAt:'complete'}));}});
 vm.runInContext(code.replace('export default {','globalThis.worker={'),c);
 const result=await c.refreshOne({MEDIA_KIT_CRON_SECRET:'secret'},{name:'gaming',url:'https://paplovag.hu/api/paplovag-showcase?section=gaming'});
 assert.equal(result.ok,true);assert.equal(result.lastSuccessAt,'complete');assert.equal(JSON.parse(bodies[1]).continuation,'signed-state');
});
