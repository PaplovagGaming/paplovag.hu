import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../functions/api/paplovag-youtube-analytics-refresh.js', import.meta.url), 'utf8');
const channel = 'UCUEDPQyLPN5lrTH06k2oWYA';
const headers = 'date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr';
const csv = (date, ctr = 0.5) => `${headers}\n${date},${channel},v,100,${ctr}\n`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function api(fetch) {
  const context = vm.createContext({ fetch, Response, Request, URL, URLSearchParams, AbortSignal, TextEncoder, TextDecoder, crypto: webcrypto, btoa, atob, structuredClone, console, Intl });
  vm.runInContext(source.replace('export async function onRequestPost', 'async function onRequestPost').replace('export function applyAvailableReach', 'function applyAvailableReach'), context);
  return vm.runInContext('({ aggregateReachCsv, syncReach, onRequestPost, getAccessToken, applyAvailableReach })', context);
}
function kv(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return { values, writes, async get(key) { return structuredClone(values.get(key) || null); }, async put(key, value) { writes.push(key); values.set(key, JSON.parse(value)); } };
}
const dates = Array.from({length: 90}, (_, i) => new Date(Date.UTC(2026, 8, 9-i)).toISOString().slice(0,10));
const reports = dates.map((date, i) => ({ id: `r${i}`, startTime: date+'T07:00:00Z', createTime: date+'T12:00:00Z', downloadUrl: `https://reports.test/${date}` }));
function google(url) {
  const u = new URL(url);
  if (u.pathname === '/v1/jobs') return json({jobs:[{id:'paplovag-job',reportTypeId:'channel_reach_basic_a1'}]});
  if (u.pathname.endsWith('/reports')) return json(u.searchParams.has('pageToken') ? {reports:reports.slice(45)} : {reports:reports.slice(0,45),nextPageToken:'second'});
  if (u.hostname === 'reports.test') return new Response(csv(u.pathname.slice(1).replaceAll('-','')));
  throw new Error('Unexpected request '+url);
}

test('CSV accepts Google compact dates, preserves low percentage CTR, handles valid empty days and rejects corrupt data', () => {
  const {aggregateReachCsv: parse} = api();
  assert.equal(parse(csv('20260909'), '2026-09-09')['2026-09-09'].ctrWeighted, 50);
  assert.equal(parse(csv('2026-09-09', 5), '2026-09-09')['2026-09-09'].ctrWeighted, 500);
  assert.equal(parse(headers+'\n','2026-09-09')['2026-09-09'].impressions,0);
  assert.throws(()=>parse(csv('20260231'),'2026-02-31'),/Invalid/);
  assert.throws(()=>parse(csv('20260909').replace(channel,'other'),'2026-09-09'),/different/);
  assert.throws(()=>parse('<html>Error</html>','2026-09-09'),/columns/);
});

test('paginated history advances across runs, reaches 90 days and never touches Tuzproba KV', async () => {
  const store=kv({'tuzproba-youtube-reach-history':{sentinel:true}});
  const {syncReach}=api(google);
  const stats={impressions90d:7,ctr:9};
  for (const expected of [30,60,90]) {
    const result=await syncReach({accessToken:'test',kv:store,analyticsEndDate:'2026-09-09',stats});
    assert.equal(result.daysCached,expected);
    assert.equal(result.status,expected===90?'ready':'backfilling');
    assert.equal(stats.impressions90d,expected * 100);
    assert.equal(result.windowDays,expected);
  }
  assert.equal(stats.impressions90d,9000);
  assert.equal(stats.ctr,0.5);
  assert.deepEqual(store.values.get('tuzproba-youtube-reach-history'),{sentinel:true});
  assert.ok(store.writes.every(key=>key==='paplovag-youtube-reach-history'));
  const again=await syncReach({accessToken:'test',kv:store,analyticsEndDate:'2026-09-09',stats});
  assert.equal(again.reportsProcessedThisRun,0);
});

test('partial downloads survive Google errors and retain the concrete error', async()=>{
  const store=kv(); let downloads=0;
  const {syncReach}=api(url=>{
    if (new URL(url).hostname==='reports.test' && ++downloads===3) return new Response('Google quota exceeded',{status:429});
    return google(url);
  });
  const stats={impressions90d:55,ctr:4};
  const result=await syncReach({accessToken:'test',kv:store,analyticsEndDate:'2026-09-09',stats});
  assert.equal(result.status,'rate_limited');
  assert.equal(result.daysCached,2);
  assert.equal(result.reportsProcessedThisRun,2);
  assert.match(result.error,/Google quota exceeded/);
  assert.equal(Object.keys(store.values.get('paplovag-youtube-reach-history').days).length,2);
  assert.equal(stats.impressions90d,200);
  assert.equal(result.windowDays,2);
});

test('job creation is saved in Paplovag history and missing report types fail explicitly', async()=>{
  const store=kv();
  const {syncReach}=api((url,init)=>{
    if (init?.method==='POST') return json({id:'new-job',reportTypeId:'channel_reach_basic_a1'});
    return json(new URL(url).pathname.endsWith('reportTypes') ? {reportTypes:[{id:'channel_reach_basic_a1'}]} : {jobs:[]});
  });
  const result=await syncReach({accessToken:'test',kv:store,analyticsEndDate:'2026-09-09',stats:{}});
  assert.equal(result.status,'job_created');
  assert.equal(store.values.get('paplovag-youtube-reach-history').jobId,'new-job');
  const unavailable=await api(()=>json({})).syncReach({accessToken:'test',kv:store,analyticsEndDate:'2026-09-09',stats:{}});
  assert.equal(unavailable.status,'report_type_unavailable');
  assert.match(unavailable.error,/No supported reach/);
});

test('refresh authorization, token namespace and Google OAuth error details',async()=>{
  const secret='test-secret'; const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const material=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(`paplovag-youtube-oauth:${secret}`));
  const key=await webcrypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt']);
  const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('test-refresh-token'));
  const store=kv({'paplovag-youtube-oauth-refresh-token':{iv:Buffer.from(iv).toString('base64url'),ciphertext:Buffer.from(encrypted).toString('base64url')}});
  const {onRequestPost}=api(()=>json({error:'invalid_grant',error_description:'Token has been expired or revoked.'},400));
  const env={MEDIA_KIT_KV:store,MEDIA_KIT_CRON_SECRET:'cron',PAPLOVAG_MEDIA_KIT_ADMIN_PASSWORD:secret,YOUTUBE_OAUTH_CLIENT_ID:'test',YOUTUBE_OAUTH_CLIENT_SECRET:'test'};
  assert.equal((await onRequestPost({request:new Request('https://paplovag.hu/api/refresh',{method:'POST'}),env})).status,401);
  const response=await onRequestPost({request:new Request('https://paplovag.hu/api/refresh',{method:'POST',headers:{Authorization:'Bearer cron'}}),env});
  const body=await response.json();
  assert.equal(response.status,502);
  assert.equal(body.error,'oauth_refresh_failed');
  assert.match(body.message,/expired or revoked/);
  assert.equal(body.googleStatus,400);
  const successApi=api((url, init)=>{
    const u=new URL(url);
    if(u.hostname==='oauth2.googleapis.com')return json({access_token:'test-access'});
    if(u.hostname==='www.googleapis.com')return json({items:[{id:channel,statistics:{subscriberCount:'123'}}]});
    if(u.hostname==='youtubeanalytics.googleapis.com'){
      const names=u.searchParams.get('metrics').split(',');
      if(u.searchParams.has('dimensions'))return json({rows:[]});
      return json({columnHeaders:names.map(name=>({name})),rows:[names.map(()=>100)]});
    }
    return google(url,init);
  });
  const success=await successApi.onRequestPost({request:new Request('https://paplovag.hu/api/refresh',{method:'POST',headers:{Authorization:'Bearer cron'}}),env});
  const updated=await success.json();
  assert.equal(success.status,200);
  assert.equal(updated.ok,true);
  assert.equal(updated.data.stats.subscribers,123);
  assert.equal(updated.data.stats.views90d,100);
  assert.ok(updated.data.youtubeSync.lastSuccessAt);
  assert.ok(store.values.has('paplovag-media-kit'));
  assert.ok(store.writes.every(key=>key.startsWith('paplovag-')));
});

const cronSource=await readFile(new URL('../cloudflare/media-kit-cron-worker.js',import.meta.url),'utf8');
test('existing cached history is displayed on load without a Google refresh, with the actual public period',async()=>{
  const history={days:Object.fromEntries(dates.slice(0,30).map(date=>[date,{parserVersion:2,impressions:100,ctrWeighted:50}]))};
  const store=kv({'paplovag-media-kit':{stats:{impressions90d:0,ctr:0},youtubeSync:{analyticsEndDate:'2026-09-09'}},'paplovag-youtube-reach-history':history});
  const context=vm.createContext({applyAvailableReach:api().applyAvailableReach,structuredClone,console});
  const dataSource=await readFile(new URL('../functions/api/paplovag-media-kit.js',import.meta.url),'utf8');
  vm.runInContext(dataSource.replace(/^import[^\n]+\n/,'').replaceAll('export async function','async function'),context);
  const data=await context.loadData({MEDIA_KIT_KV:store});
  assert.equal(data.stats.impressions90d,3000);
  assert.equal(data.stats.ctr,0.5);
  assert.equal(data.youtubeReachSync.windowDays,30);
  assert.equal(store.writes.length,0);
  const js=await readFile(new URL('../js/paplovag-media-kit-v4.js',import.meta.url),'utf8');
  const nodes=new Map();const byId=id=>{if(!nodes.has(id))nodes.set(id,{style:{setProperty(){}}});return nodes.get(id);};
  const ui=vm.createContext({byId,activeLang:'en',translations:{en:{stats:{hours:'hrs',last90:'Last 90 days'}}},dateText:String,compact:String,pct:String,fallbackData:{contact:{}},escapeHtml:String});
  vm.runInContext(js.slice(js.indexOf('function renderData('),js.indexOf('function videoCard(')),ui);
  ui.renderData(data);
  assert.equal(byId('stat-impressions90').textContent,'3000');
  assert.equal(byId('stat-ctr').textContent,'0.50%');
  assert.equal(byId('card-impressions90').hidden,false);
  assert.match(byId('reach-impressions-period').textContent,/30 days · 2026-08-11 – 2026-09-09/);
  const gap=api().applyAvailableReach({stats:{}},{days:{...history.days,'2026-09-08':undefined}},'2026-09-09');
  assert.equal(gap.youtubeReachSync.windowDays,1);
});
test('cron attempts both channels after network failure, rejects failed runs, handles Budapest summer/winter',async()=>{
  for (const at of ['2026-09-09T22:01:00Z','2026-12-09T23:01:00Z']) {
    const calls=[];
    const context=vm.createContext({URL,Response,AbortSignal,Intl,console,fetch:async url=>{calls.push(url);if(calls.length===1)throw new Error('network down');return json({ok:true,data:{youtubeReachSync:{status:'backfilling',daysCached:30}}});}});
    vm.runInContext(cronSource.replace('export default {','globalThis.worker = {'),context);
    let pending;
    await context.worker.scheduled({scheduledTime:Date.parse(at)},{MEDIA_KIT_CRON_SECRET:'test'},{waitUntil(p){pending=p;}});
    await assert.rejects(pending,/Media Kit refresh failed/);
    assert.equal(calls.length,6);
    assert.match(calls[1],/paplovag-youtube-analytics-refresh/);
    pending=null;
    await context.worker.scheduled({scheduledTime:Date.parse('2026-09-09T21:02:00Z')},{},{waitUntil(p){pending=p;}});
    assert.equal(pending,null);
  }
});

test('admin click displays progress beside the button and a concrete Google error, then reenables the button',async()=>{
  const js=await readFile(new URL('../js/paplovag-media-kit-admin.js',import.meta.url),'utf8');
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{textContent:id==='youtube-refresh'?'Refresh YouTube data now':'',children:[{}],classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this[event]=fn;}});
    return elements.get(id);
  };
  let finish;
  const context=vm.createContext({document:{getElementById:get},AbortController,setTimeout,clearTimeout,Intl,URL,console,fetch:async url=>{
    if(url.includes('analytics-refresh'))return new Promise(resolve=>{finish=resolve;});
    return json({authenticated:false});
  }});
  vm.runInContext(js,context);
  const click=get('youtube-refresh').click();
  assert.equal(get('youtube-refresh').disabled,true);
  assert.match(get('youtube-refresh-status').textContent,/Refreshing/);
  finish(json({ok:false,error:'oauth_refresh_failed',message:'Google says revoked token',googleStatus:400},502));
  await click;
  assert.match(get('youtube-refresh-status').textContent,/Google says revoked token/);
  assert.equal(get('youtube-refresh').disabled,false);
  const successClick=get('youtube-refresh').click();
  finish(json({ok:true,data:{stats:{subscribers:123,views90d:456},youtubeSync:{lastSuccessAt:'2026-09-10T12:00:00Z'},youtubeReachSync:{status:'backfilling',daysCached:30,reportsProcessedThisRun:30}}}));
  await successClick;
  assert.equal(get('subscribers').value,123);
  assert.equal(get('views90d').value,456);
  assert.match(get('youtube-refresh-status').textContent,/30 days cached/);
  assert.equal(get('youtube-refresh').disabled,false);
});

