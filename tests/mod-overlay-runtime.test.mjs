import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../mod/overlay/overlay.js',import.meta.url),'utf8');
function fixture({storage=new Map(),blocked=false,obs=true}={}){
 let clock=Date.parse('2026-10-14T10:00:00Z'),counter=0,confetti=0,requests=0;
 const timers=new Map(),listeners=new Map(),elements=Object.fromEntries(['connection','result','prize','moderator','winner','claim-clock','overlay-heading'].map(id=>[id,{hidden:true,textContent:'',classList:{add(){},remove(){}}}]));
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 function later(fn,ms,repeat){const id=++counter;timers.set(id,{fn,at:clock+ms,ms,repeat});return id;}
 runInNewContext(source,{location:{search:'',hash:'#existing-read-only-link'},URLSearchParams,Date:ClockDate,Math,Set,
  window:{obsstudio:obs?{}:undefined,addEventListener:(name,fn)=>listeners.set(name,fn)},
  sessionStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k);},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v);}},
  document:{querySelector:s=>elements[s.slice(1)],createElement:()=>({style:{},remove(){}}),body:{append(){confetti++;}}},
  fetch:()=>{requests++;throw Error('Overlay must never call Cloudflare');},WebSocket:class{constructor(){throw Error('No control socket allowed in overlay');}},
  setTimeout:(fn,ms)=>later(fn,ms,false),setInterval:(fn,ms)=>later(fn,ms,true),clearInterval:id=>timers.delete(id)});
 const draw=(id='round-1',extra={})=>({id,created_at:new ClockDate(clock).toISOString(),prize:'Prize',actor_name:'Mod',winner:{display_name:'Chosen',platform:'twitch'},
  reveal_at:new ClockDate(clock+3000).toISOString(),claim_deadline:new ClockDate(clock+93000).toISOString(),claim_status:'awaiting',candidates:['Other','Chosen'],...extra});
 function packet(d,extra={}){listeners.get('paplovagModOverlay')({detail:{protocol:'paplovag-overlay-v1',eventId:d?d.id+':'+d.claim_status:'idle',serverNow:new ClockDate(clock).toISOString(),draw:d,...extra}});}
 function advance(ms){const end=clock+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
  const [id,t]=next;clock=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn();}clock=end;}
 return {elements,storage,draw,packet,advance,now:()=>new ClockDate(clock).toISOString(),confetti:()=>confetti,requests:()=>requests,listeners};
}
test('idle OBS overlay makes zero Cloudflare requests or socket connections',()=>{const f=fixture();f.advance(3600000);assert.equal(f.requests(),0);assert.equal(f.elements.result.hidden,true);});
test('draw and duplicate delivery animate once; reroll uses new event/round ID',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(1000);f.packet(d);f.advance(4100);
 assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);f.packet(d);assert.equal(f.confetti(),65);
 f.packet(f.draw('reroll-2',{created_at:f.now()}));f.advance(5100);assert.equal(f.confetti(),130);assert.equal(f.requests(),0);});
test('claimed winner hides four seconds after confirmation, awaiting/expired cannot undo it',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(5100);
 const claimed={...d,claim_status:'claimed',claimed_at:f.now()};f.packet(claimed);f.advance(3000);assert.equal(f.elements.result.hidden,false);f.packet(d);f.advance(1250);assert.equal(f.elements.result.hidden,true);});
test('OBS reload restores a snapshot without another winner celebration, even if storage is blocked',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(5100);
 const restored=fixture({storage:f.storage});restored.advance(5100);restored.packet(d);assert.equal(restored.elements.winner.textContent,'Chosen');assert.equal(restored.confetti(),0);
 const blocked=fixture({blocked:true});blocked.packet(blocked.draw());blocked.advance(5100);blocked.packet(blocked.draw('round-1'));assert.equal(blocked.confetti(),65);
 const blockedReload=fixture({blocked:true});blockedReload.advance(5100);blockedReload.packet(d,{replay:true});assert.equal(blockedReload.confetti(),0);assert.equal(blockedReload.elements.winner.textContent,'Chosen');});
test('late first delivery spins locally but keeps original claim deadline; old packets cannot replace a reroll',()=>{const f=fixture(),d=f.draw();f.advance(20000);f.packet(d);assert.notEqual(f.elements.winner.textContent,'Chosen');f.advance(5100);assert.equal(f.elements.winner.textContent,'Chosen');
 assert.match(f.elements['claim-clock'].textContent,/68 mp/);const newer=f.draw('reroll-2');f.packet(newer);f.packet(d,{serverNow:'2026-10-14T09:00:00Z'});f.advance(5100);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),130);});
test('expiration is presentation only, OBS disconnect/idle clears and reconnection resumes',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(94000);assert.match(f.elements['claim-clock'].textContent,/Nem jelentkezett/);
 f.listeners.get('obsExit')();assert.equal(f.elements.result.hidden,true);f.packet({...d,claim_status:'expired'});assert.equal(f.confetti(),65);f.packet(null);assert.equal(f.elements.result.hidden,true);assert.equal(f.requests(),0);});
test('invalid event payload or protocol cannot start an animation',()=>{const f=fixture();f.packet(f.draw(),{protocol:'other'});f.packet({...f.draw(),winner:{display_name:'Fake',platform:'bad'}});assert.equal(f.elements.result.hidden,true);});
test('late overlay test spins five seconds and hides after nine; replays never extend it',()=>{
 const f=fixture(),d=f.draw('test-1',{test:true,claim_status:'test'});f.advance(20000);f.packet(d);
 assert.equal(f.elements.result.hidden,false);assert.notEqual(f.elements.winner.textContent,'Chosen');
 f.advance(5100);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
 f.packet(d,{replay:true});f.advance(3800);assert.equal(f.elements.result.hidden,false);
 f.advance(350);assert.equal(f.elements.result.hidden,true);f.packet(d,{replay:true});assert.equal(f.elements.result.hidden,true);
 f.advance(20000);f.packet(d,{replay:true});assert.equal(f.elements.result.hidden,true);assert.equal(f.confetti(),65);assert.equal(f.requests(),0);
 f.packet(f.draw('test-2',{test:true,claim_status:'test'}));assert.equal(f.elements.result.hidden,false);
});
test('a bot replay unseen by this browser still cycles names for five seconds on test and real draws',()=>{
 for(const isTest of [true,false]){
  const f=fixture(),d=f.draw('first-seen',{test:isTest,claim_status:isTest?'test':'awaiting',candidates:['Alpha','Beta','Gamma']});
  f.advance(20000);f.packet(d,{replay:true});assert.equal(f.elements.winner.textContent,'Alpha');
  f.advance(400);assert.equal(f.elements.winner.textContent,'Beta');f.packet(d,{replay:true});
  f.advance(4590);assert.notEqual(f.elements.winner.textContent,'Chosen');
  f.advance(20);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
  assert.equal(f.requests(),0);
 }
});
