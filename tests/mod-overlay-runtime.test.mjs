import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../mod/overlay/overlay.js',import.meta.url),'utf8');
async function overlay({hash='#synthetic-overlay-token',blocked=true,status=200,draw={},response}={}) {
 const elements=Object.fromEntries(['connection','result','prize','moderator','winner','claim-clock','overlay-heading'].map(id=>[id,{hidden:true,textContent:'',classList:{add(){},remove(){}}}]));
 const requests=[];
 let clock=Date.now();const intervals=[];
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const now=new Date(clock).toISOString();
 runInNewContext(script,{
  location:{hash,search:'',pathname:'/mod/overlay/'},history:{replaceState(){throw new Error('Must not strip OBS URL credentials');}},
  sessionStorage:{getItem(){if(blocked)throw new Error('Storage blocked');return null;},setItem(){if(blocked)throw new Error('Storage blocked');}},
  document:{querySelector:s=>elements[s.slice(1)],createElement:()=>({style:{},remove(){}}),body:{append(){}}},
  fetch:async(url,options)=>{requests.push({url,options});if(response)return response(clock);return{status,ok:status===200,json:async()=>({serverNow:now,draw:{id:'real-api-round',prize:'Synthetic prize',actor_name:'Test mod',winner:{display_name:'Winner',platform:'twitch'},reveal_at:now,claim_deadline:new Date(clock+90000).toISOString(),claim_status:'awaiting',candidates:['Winner','Other'],...draw}})};},
  setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},setTimeout:fn=>queueMicrotask(fn),URLSearchParams,Date:ClockDate,Math,Promise,
 });
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,requests,advance:ms=>{clock+=ms;intervals.filter(i=>i.ms===250).forEach(i=>i.fn());},pump:async(ms=0)=>{clock+=ms;intervals.filter(i=>i.ms===1000).forEach(i=>i.fn());await new Promise(resolve=>setImmediate(resolve));}};
}
test('real API round renders when OBS storage is blocked',async()=>{
 const {elements,requests}=await overlay();
 assert.equal(requests[0].options.headers.authorization,'Bearer synthetic-overlay-token');
 assert.equal(elements.result.hidden,false);assert.equal(elements.winner.textContent,'Winner');
 assert.match(elements['claim-clock'].textContent,/\d+ mp/);assert.equal(elements.connection.hidden,true);
});
test('missing credentials and revoked URLs produce visible actionable messages',async()=>{
 const missing=await overlay({hash:''});assert.equal(missing.requests.length,0);assert.match(missing.elements.connection.textContent,/Nincs overlay-cím/);
 const revoked=await overlay({status:401});assert.equal(revoked.elements.connection.hidden,false);assert.match(revoked.elements.connection.textContent,/érvénytelen/);
});
test('claimed winner hides four seconds after server confirmation and stays hidden on reload',async()=>{
 const confirmedAt=new Date().toISOString();
 const result=await overlay({draw:{claim_status:'claimed',claimed_at:confirmedAt}});
 assert.equal(result.elements.result.hidden,false);
 result.advance(3000);assert.equal(result.elements.result.hidden,false);
 result.advance(1100);assert.equal(result.elements.result.hidden,true);
 const reloaded=await overlay({draw:{claim_status:'claimed',claimed_at:new Date(Date.now()-5000).toISOString()}});
 assert.equal(reloaded.elements.result.hidden,true);assert.equal(reloaded.elements.winner.textContent,'');
 const waiting=await overlay();waiting.advance(80000);assert.equal(waiting.elements.result.hidden,false,'unclaimed winner retains claim countdown');
});

test('idle polling is halved and failures back off with recovery',async()=>{
 let healthy=true;
 const f=await overlay({response:clock=>({status:healthy?200:503,ok:healthy,json:async()=>({serverNow:new Date(clock).toISOString(),draw:null})})});
 await f.pump(1000);assert.equal(f.requests.length,1);
 await f.pump(1000);assert.equal(f.requests.length,2);
 healthy=false;await f.pump(2000);assert.equal(f.requests.length,3);
 await f.pump(4000);assert.equal(f.requests.length,3);
 await f.pump(1000);assert.equal(f.requests.length,4);
 await f.pump(9000);assert.equal(f.requests.length,4);
 healthy=true;await f.pump(1000);assert.equal(f.requests.length,5);assert.equal(f.elements.connection.hidden,true);
 await f.pump(1000);assert.equal(f.requests.length,5);
 await f.pump(1000);assert.equal(f.requests.length,6);
 healthy=false;await f.pump(2000);await f.pump(5000);assert.equal(f.requests.length,8,'successful response resets error delay');
});

test('slow requests never overlap and revoked links retry only once a minute',async()=>{
 let complete;
 const slow=await overlay({response:()=>new Promise(resolve=>{complete=resolve;})});
 await slow.pump(10000);assert.equal(slow.requests.length,1);
 complete({status:200,ok:true,json:async()=>({serverNow:new Date().toISOString(),draw:null})});
 await new Promise(resolve=>setImmediate(resolve));
 await slow.pump(2000);assert.equal(slow.requests.length,2);
 const revoked=await overlay({status:401});await revoked.pump(59000);assert.equal(revoked.requests.length,1);
 await revoked.pump(1000);assert.equal(revoked.requests.length,2);
});
