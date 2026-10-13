import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../cloudflare/media-kit-cron-worker.js',import.meta.url),'utf8');
function fixture(respond){
 const calls=[];
 const worker=runInNewContext(source.replace('export default','globalThis.worker =')+';worker;',{
  URL,Response,AbortSignal,console:{log(){},error(){}},fetch:async(url,options)=>{calls.push({url,options});return respond?respond(url,options,calls.length):Response.json({ok:true});}
 });return {worker,calls};
}
test('daily event refreshes both analytics and all four lists in summer and winter',async()=>{
 for(const date of ['2026-10-13T22:01:00Z','2026-12-13T22:01:00Z']){
  const f=fixture();let task;await f.worker.scheduled({scheduledTime:Date.parse(date)},{MEDIA_KIT_CRON_SECRET:'synthetic'},{waitUntil:p=>{task=p;}});await task;
  assert.equal(f.calls.length,6);assert.equal(new Set(f.calls.map(c=>c.url)).size,6);
  assert.ok(f.calls.every(c=>c.options.method==='POST'&&c.options.headers.Authorization==='Bearer synthetic'));
 }
 const health=await fixture().worker.fetch(new Request('https://cron.test/health'),{});const data=await health.json();assert.equal(data.schedule,'1 22 * * *');assert.equal(data.dailyVideoTargets.length,4);
});
test('playlist continuation finishes before moving on and failed target does not suppress other lists',async()=>{
 const f=fixture((url,options,n)=>n===1?Response.json({ok:true,pending:true,continuation:'synthetic-cursor'}):n===2?Response.json({ok:false},{status:503}):Response.json({ok:true}));
 let task;await f.worker.scheduled({}, {MEDIA_KIT_CRON_SECRET:'synthetic'}, {waitUntil:p=>{task=p;}});
 await assert.rejects(task,/Media Kit refresh failed/);assert.equal(f.calls.length,7);
 assert.equal(JSON.parse(f.calls[1].options.body).continuation,'synthetic-cursor');
});
