import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../mod/overlay/overlay.js',import.meta.url),'utf8');
function fixture({storage=new Map(),blocked=false,obs=true,audio=false,search='',audioFails=false,playFails=false}={}){
 let clock=Date.parse('2026-10-14T10:00:00Z'),counter=0,confetti=0,requests=0;
 const timers=new Map(),listeners=new Map(),elements=Object.fromEntries(['connection','result','prize','moderator','winner','claim-clock','overlay-heading'].map(id=>[id,{hidden:true,textContent:'',classList:{add(){},remove(){}}}]));
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 function later(fn,ms,repeat){const id=++counter;timers.set(id,{fn,at:clock+ms,ms,repeat});return id;}
 const clips=[];
 class TestClip {
  constructor(src){if(audioFails)throw Error('Audio unavailable');this.src=src;this.plays=0;this.pauses=0;this.loads=0;this.playTimes=[];clips.push(this);}
  load(){this.loads++;}
  play(){this.plays++;this.playTimes.push(clock);if(playFails)return Promise.reject(Error('Playback blocked'));return Promise.resolve();}
  pause(){this.pauses++;}
 }
 runInNewContext(source,{location:{search,hash:'#existing-read-only-link'},URLSearchParams,Date:ClockDate,Math,Set,
  window:{obsstudio:obs?{}:undefined,Audio:audio?TestClip:undefined,addEventListener:(name,fn)=>listeners.set(name,fn)},
  sessionStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k);},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v);}},
  document:{querySelector:s=>elements[s.slice(1)],createElement:()=>({style:{},remove(){}}),body:{append(){confetti++;}}},
  fetch:()=>{requests++;throw Error('Overlay must never call Cloudflare');},WebSocket:class{constructor(){throw Error('No control socket allowed in overlay');}},
  setTimeout:(fn,ms)=>later(fn,ms,false),setInterval:(fn,ms)=>later(fn,ms,true),clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id)});
 const draw=(id='round-1',extra={})=>({id,created_at:new ClockDate(clock).toISOString(),prize:'Prize',actor_name:'Mod',winner:{display_name:'Chosen',platform:'twitch'},
  reveal_at:new ClockDate(clock+7996).toISOString(),claim_deadline:new ClockDate(clock+97996).toISOString(),claim_status:'awaiting',candidates:['Other','Chosen'],...extra});
 function packet(d,extra={}){listeners.get('paplovagModOverlay')({detail:{protocol:'paplovag-overlay-v1',eventId:d?d.id+':'+d.claim_status:'idle',serverNow:new ClockDate(clock).toISOString(),draw:d,...extra}});}
 function advance(ms){const end=clock+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
  const [id,t]=next;clock=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(id);t.fn();}clock=end;}
 return {elements,storage,draw,packet,advance,now:()=>new ClockDate(clock).toISOString(),confetti:()=>confetti,requests:()=>requests,listeners,clips,
  clip:kind=>clips.find(c=>c.src.endsWith(kind==='roll'?'porgetes.wav':'nyertes.wav'))};
}
test('idle OBS overlay makes zero Cloudflare requests or socket connections',()=>{const f=fixture();f.advance(3600000);assert.equal(f.requests(),0);assert.equal(f.elements.result.hidden,true);});
test('draw and duplicate delivery animate once; reroll uses new event/round ID',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(1000);f.packet(d);f.advance(7100);
 assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);f.packet(d);assert.equal(f.confetti(),65);
 f.packet(f.draw('reroll-2',{created_at:f.now()}));f.advance(8100);assert.equal(f.confetti(),130);assert.equal(f.requests(),0);});
test('claimed winner hides four seconds after confirmation, awaiting/expired cannot undo it',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(8100);
 const claimed={...d,claim_status:'claimed',claimed_at:f.now()};f.packet(claimed);f.advance(3000);assert.equal(f.elements.result.hidden,false);f.packet(d);f.advance(1250);assert.equal(f.elements.result.hidden,true);});
test('OBS reload restores a snapshot without another winner celebration, even if storage is blocked',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(8100);
 const restored=fixture({storage:f.storage});restored.advance(8100);restored.packet(d);assert.equal(restored.elements.winner.textContent,'Chosen');assert.equal(restored.confetti(),0);
 const blocked=fixture({blocked:true});blocked.packet(blocked.draw());blocked.advance(8100);blocked.packet(blocked.draw('round-1'));assert.equal(blocked.confetti(),65);
 const blockedReload=fixture({blocked:true});blockedReload.advance(8100);blockedReload.packet(d,{replay:true});assert.equal(blockedReload.confetti(),0);assert.equal(blockedReload.elements.winner.textContent,'Chosen');});
test('late first delivery spins locally but keeps original claim deadline; old packets cannot replace a reroll',()=>{const f=fixture(),d=f.draw();f.advance(20000);f.packet(d);assert.notEqual(f.elements.winner.textContent,'Chosen');f.advance(8100);assert.equal(f.elements.winner.textContent,'Chosen');
 assert.match(f.elements['claim-clock'].textContent,/70 mp/);const newer=f.draw('reroll-2');f.packet(newer);f.packet(d,{serverNow:'2026-10-14T09:00:00Z'});f.advance(8100);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),130);});
test('expiration is presentation only, OBS disconnect/idle clears and reconnection resumes',()=>{const f=fixture(),d=f.draw();f.packet(d);f.advance(98000);assert.match(f.elements['claim-clock'].textContent,/Nem jelentkezett/);
 f.listeners.get('obsExit')();assert.equal(f.elements.result.hidden,true);f.packet({...d,claim_status:'expired'});assert.equal(f.confetti(),65);f.packet(null);assert.equal(f.elements.result.hidden,true);assert.equal(f.requests(),0);});
test('invalid event payload or protocol cannot start an animation',()=>{const f=fixture();f.packet(f.draw(),{protocol:'other'});f.packet({...f.draw(),winner:{display_name:'Fake',platform:'bad'}});assert.equal(f.elements.result.hidden,true);});
test('late overlay test uses WAV duration and hides four seconds after reveal; replays never extend it',()=>{
 const f=fixture(),d=f.draw('test-1',{test:true,claim_status:'test'});f.advance(20000);f.packet(d);
 assert.equal(f.elements.result.hidden,false);assert.notEqual(f.elements.winner.textContent,'Chosen');
 f.advance(8100);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
 f.packet(d,{replay:true});f.advance(3800);assert.equal(f.elements.result.hidden,false);
 f.advance(350);assert.equal(f.elements.result.hidden,true);f.packet(d,{replay:true});assert.equal(f.elements.result.hidden,true);
 f.advance(20000);f.packet(d,{replay:true});assert.equal(f.elements.result.hidden,true);assert.equal(f.confetti(),65);assert.equal(f.requests(),0);
 f.packet(f.draw('test-2',{test:true,claim_status:'test'}));assert.equal(f.elements.result.hidden,false);
});
test('a bot replay unseen by this browser still cycles names for the WAV duration on test and real draws',()=>{
 for(const isTest of [true,false]){
  const f=fixture(),d=f.draw('first-seen',{test:isTest,claim_status:isTest?'test':'awaiting',candidates:['Alpha','Beta','Gamma']});
  f.advance(20000);f.packet(d,{replay:true});assert.equal(f.elements.winner.textContent,'Alpha');
  f.advance(100);assert.equal(f.elements.winner.textContent,'Beta');f.packet(d,{replay:true});
  f.advance(7890);assert.notEqual(f.elements.winner.textContent,'Chosen');
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
  f.advance(7830);assert.equal(f.elements.winner.textContent,'Chosen');assert.equal(f.confetti(),65);
  assert.equal(f.requests(),0);
 }
});
test('custom roll WAV plays once for its duration, then winner WAV and confetti start together',()=>{
 const f=fixture({audio:true}),d=f.draw();f.packet(d);assert.equal(f.clip('roll').plays,1);assert.equal(f.clip('winner').plays,0);
 f.advance(1000);f.packet(d);f.advance(6995);assert.equal(f.clip('winner').plays,0);assert.equal(f.confetti(),0);
 f.advance(1);assert.equal(f.clip('winner').plays,1);assert.equal(f.confetti(),65);
 assert.equal(f.clip('winner').playTimes[0]-f.clip('roll').playTimes[0],7996);assert.ok(f.clip('roll').pauses>0);
 for(const clip of f.clips){assert.equal(clip.loads,1);assert.equal(clip.volume,0.35);}
 f.packet(d);f.packet({...d,claim_status:'claimed',claimed_at:f.now()});f.advance(4500);assert.equal(f.clip('roll').plays,1);assert.equal(f.clip('winner').plays,1);
 const restored=fixture({audio:true,storage:f.storage});restored.advance(10000);restored.packet(d,{replay:true});assert.equal(restored.clips.length,0);
 assert.equal(f.requests(),0);
});
test('sound mute, volume and unavailable audio never interfere with OBS presentation',()=>{
 for(const search of ['?sound=0','?volume=0']){const f=fixture({audio:true,search});f.packet(f.draw());f.advance(8100);assert.equal(f.clips.length,0);assert.equal(f.elements.winner.textContent,'Chosen');}
 const quiet=fixture({audio:true,search:'?volume=10'});quiet.packet(quiet.draw());assert.equal(quiet.clip('roll').volume,0.1);assert.equal(quiet.clip('winner').volume,0.1);
 const unavailable=fixture({audio:true,audioFails:true});unavailable.packet(unavailable.draw());unavailable.advance(8100);assert.equal(unavailable.elements.winner.textContent,'Chosen');assert.equal(unavailable.confetti(),65);
});
test('clearing or disconnecting stops the roll WAV and prevents the old winner sound',()=>{
 for(const clear of [f=>f.packet(null),f=>f.listeners.get('obsExit')()]){
  const f=fixture({audio:true});f.packet(f.draw());f.advance(10);clear(f);
  assert.ok(f.clip('roll').pauses>0);f.advance(9000);assert.equal(f.clip('roll').plays,1);assert.equal(f.clip('winner').plays,0);assert.equal(f.elements.result.hidden,true);
 }
});
test('both WAV players preload once and restart once per new round; failed playback preserves confetti',async()=>{
 const f=fixture({audio:true}),d=f.draw();f.packet(d);assert.equal(f.clip('winner').loads,1);assert.equal(f.clip('winner').plays,0);f.advance(8100);
 f.packet(f.draw('reroll'));f.advance(8100);assert.equal(f.clips.length,2);for(const clip of f.clips){assert.equal(clip.loads,1);assert.equal(clip.plays,2);}
 const failed=fixture({audio:true,playFails:true});failed.packet(failed.draw());failed.advance(8100);await Promise.resolve();assert.equal(failed.elements.winner.textContent,'Chosen');assert.equal(failed.confetti(),65);
});
test('roll timing matches the supplied WAV frames to within one millisecond',()=>{
 const wav=readFileSync(new URL('../mod/overlay/sounds/porgetes.wav',import.meta.url));assert.equal(wav.toString('ascii',0,4),'RIFF');
 let rate,align,size;for(let pos=12;pos+8<=wav.length;){const id=wav.toString('ascii',pos,pos+4),length=wav.readUInt32LE(pos+4),body=pos+8;
  if(id==='fmt '){rate=wav.readUInt32LE(body+4);align=wav.readUInt16LE(body+12);}if(id==='data')size=length;pos=body+length+(length%2);
 }
 const duration=size/align/rate*1000;assert.equal(Math.ceil(duration),7996);assert.ok(7996-duration<1);
});
