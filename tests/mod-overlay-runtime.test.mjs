import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../mod/overlay/overlay.js',import.meta.url),'utf8');
async function overlay({hash='#synthetic-overlay-token',blocked=true,status=200}={}) {
 const elements=Object.fromEntries(['connection','result','prize','moderator','winner','claim-clock','overlay-heading'].map(id=>[id,{hidden:true,textContent:'',classList:{add(){},remove(){}}}]));
 const requests=[];
 const now=new Date().toISOString();
 runInNewContext(script,{
  location:{hash,search:'',pathname:'/mod/overlay/'},history:{replaceState(){throw new Error('Must not strip OBS URL credentials');}},
  sessionStorage:{getItem(){if(blocked)throw new Error('Storage blocked');return null;},setItem(){if(blocked)throw new Error('Storage blocked');}},
  document:{querySelector:s=>elements[s.slice(1)],createElement:()=>({style:{},remove(){}}),body:{append(){}}},
  fetch:async(url,options)=>{requests.push({url,options});return{status,ok:status===200,json:async()=>({serverNow:now,draw:{id:'real-api-round',prize:'Synthetic prize',actor_name:'Test mod',winner:{display_name:'Winner',platform:'twitch'},reveal_at:now,claim_deadline:new Date(Date.now()+90000).toISOString(),claim_status:'awaiting',candidates:['Winner','Other']}})};},
  setInterval:()=>1,clearInterval(){},setTimeout:fn=>queueMicrotask(fn),URLSearchParams,Date,Math,Promise,
 });
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,requests};
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
