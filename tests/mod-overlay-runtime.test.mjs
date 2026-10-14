import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../mod/overlay/overlay.js',import.meta.url),'utf8');
function fixture({storage=new Map(),blocked=false,obs=true,audio=false,search='',audioFails=false}={}){
 let clock=Date.parse('2026-10-14T10:00:00Z'),counter=0,confetti=0,requests=0;
 const timers=new Map(),listeners=new Map(),elements=Object.fromEntries(['connection','result','prize','moderator','winner','claim-clock','overlay-heading'].map(id=>[id,{hidden:true,textContent:'',classList:{add(){},remove(){}}}]));
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 function later(fn,ms,repeat){const id=++counter;timers.set(id,{fn,at:clock+ms,ms,repeat});return id;}
 const tones=[],clicks=[];
 let lastSound=null;
 class TestAudio {
  constructor(){if(audioFails)throw Error('Audio unavailable');this.state='running';this.sampleRate=48000;this.destination={};}
  get currentTime(){return (clock-Date.parse('2026-10-14T10:00:00Z'))/1000;}
  createOscillator(){const tone={};tones.push(tone);lastSound=tone;return {set type(value){tone.type=value;},frequency:{setValueAtTime(f){tone.frequency=f;}},connect(){},disconnect(){},start(at){tone.start=at;},stop(){this.onended?.();}};}
  createGain(){const sound=lastSound;return {gain:{set value(v){sound.volume=v;},setValueAtTime(){},linearRampToValueAtTime(v){sound.volume=v;},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  createBiquadFilter(){return {frequency:{value:0},Q:{value:0},connect(){},disconnect(){}};}
  createBufferSource(){const click={};clicks.push(click);lastSound=click;let endTimer;return {connect(){},disconnect(){},start(){click.at=clock;endTimer=later(()=>this.onended?.(),35,false);},stop(){click.stopped=true;timers.delete(endTimer);this.onended?.();}};}
 }
 runInNewContext(source,{location:{search,hash:'#existing-read-only-link'},URLSearchParams,Date:ClockDate,Math,Set,
  window:{obsstudio:obs?{}:undefined,AudioContext:audio?TestAudio:undefined,addEventListener:(name,fn)=>listeners.set(name,fn)},
  sessionStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k);},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v);}},
  document:{querySelector:s=>elements[s.slice(1)],createElement:()=>({style:{},remove(){}}),body:{append(){confetti++;}}},
  fetch:()=>{requests++;throw Error('Overlay must never call Cloudflare');},WebSocket:class{constructor(){throw Error('No control socket allowed in overlay');}},
  setTimeout:(fn,ms)=>later(fn,ms,false),setInterval:(fn,ms)=>later(fn,ms,true),clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id)});
 const draw=(id='round-1',extra={})=>({id,created_at:new ClockDate(clock).toISOString(),prize:'Prize',actor_name:'Mod',winner:{display_name:'Chosen',platform:'twitch'},
  reveal_at:new ClockDate(clock+3000).toISOString(),claim_deadline:new ClockDate(clock+93000).toISOString(),claim_status:'awaiting',candidates:['Other','Chosen'],...extra});
 function packet(d,extra={}){listeners.get('paplovagModOverlay')({detail:{protocol:'paplovag-overlay-v1',eventId:d?d.id+':'+d.claim_status:'idle',serverNow:new ClockDate(clock).toISOString(),draw:d,...extra}});}
 function advance(ms){const end=clock+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
  const [id,t]=next;clock=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn();}clock=end;}
 return {elements,storage,draw,packet,advance,now:()=>new ClockDate(clock).toISOString(),confetti:()=>confetti,requests:()=>requests,listeners,tones,clicks};
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
  f.advance(100);assert.equal(f.elements.winner.textContent,'Beta');f.packet(d,{replay:true});
  f.advance(4890);assert.notEqual(f.elements.winner.textContent,'Chosen');
  f.advance(20);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
  assert.equal(f.requests(),0);
 }
});
// libobs obs_data_add_json_array keeps objects and discards primitive array items.
function obsDataRoundtrip(value){
 if(Array.isArray(value))return value.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)).map(obsDataRoundtrip);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,obsDataRoundtrip(v)]));
 return value;
}
test('OBS vendor conversion preserves object names and the overlay cycles real and test candidates',()=>{
 assert.deepEqual(obsDataRoundtrip({candidates:['Alpha','Beta']}).candidates,[]);
 for(const isTest of [true,false]){
  const f=fixture(),d=f.draw('obs-object-names',{test:isTest,claim_status:isTest?'test':'awaiting',
   candidates:[{display_name:'Alpha'},{display_name:'Beta'},{display_name:'Gamma'}]});
  const delivered=obsDataRoundtrip(d);f.packet(delivered);assert.equal(f.elements.winner.textContent,'Alpha');
  f.advance(100);assert.equal(f.elements.winner.textContent,'Beta');f.advance(80);assert.equal(f.elements.winner.textContent,'Gamma');
  f.advance(4830);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
  assert.equal(f.requests(),0);
 }
});
test('roll ticks and confetti fanfare play once; duplicates, claim updates and reload stay silent',()=>{
 const f=fixture({audio:true}),d=f.draw();f.packet(d);f.advance(1000);f.packet(d);f.advance(4100);
 assert.ok(f.clicks.length>20);
 const gaps=f.clicks.slice(1).map((c,i)=>c.at-f.clicks[i].at);assert.ok(gaps.at(-1)>gaps[0]*4,'roulette clicks slow down toward the winner');
 assert.deepEqual(f.tones.filter(t=>t.type==='sawtooth').map(t=>t.frequency),[261.625,329.625,391.995,523.25]);
 assert.equal(f.tones.length,13);assert.ok(f.tones.some(t=>t.frequency===130.81));
 const count=f.tones.length,clickCount=f.clicks.length;f.packet(d);f.packet({...d,claim_status:'claimed',claimed_at:f.now()});f.advance(4500);assert.equal(f.tones.length,count);assert.equal(f.clicks.length,clickCount);
 const restored=fixture({audio:true,storage:f.storage});restored.advance(10000);restored.packet(d,{replay:true});assert.equal(restored.tones.length,0);assert.equal(restored.clicks.length,0);
 assert.equal(f.requests(),0);
});
test('sound mute, volume and unavailable audio never interfere with OBS presentation',()=>{
 for(const search of ['?sound=0','?volume=0']){const f=fixture({audio:true,search});f.packet(f.draw());f.advance(5100);assert.equal(f.tones.length,0);assert.equal(f.clicks.length,0);assert.equal(f.elements.winner.textContent,'Chosen');}
 const quiet=fixture({audio:true,search:'?volume=10'});quiet.packet(quiet.draw());assert.ok(Math.abs(quiet.clicks[0].volume-0.055)<0.00001);
 const unavailable=fixture({audio:true,audioFails:true});unavailable.packet(unavailable.draw());unavailable.advance(5100);assert.equal(unavailable.elements.winner.textContent,'Chosen');assert.equal(unavailable.confetti(),65);
});
test('clearing or disconnecting stops roulette clicks and prevents an old victory fanfare',()=>{
 for(const clear of [f=>f.packet(null),f=>f.listeners.get('obsExit')()]){
  const f=fixture({audio:true});f.packet(f.draw());f.advance(10);clear(f);const count=f.clicks.length;
  assert.equal(f.clicks[0].stopped,true);f.advance(6000);assert.equal(f.clicks.length,count);assert.equal(f.tones.length,0);assert.equal(f.elements.result.hidden,true);
 }
});
