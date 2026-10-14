// OBS dispatches this CustomEvent through its existing authenticated obs-websocket connection.
// This page opens no socket and makes no API requests. No OBS/API credential is needed here.
const demo=new URLSearchParams(location.search).get('demo')==='1';
const soundParams=new URLSearchParams(location.search),requestedVolume=Number(soundParams.get('volume'));
const soundVolume=soundParams.get('sound')==='0'?0:soundParams.has('volume')&&Number.isFinite(requestedVolume)?Math.max(0,Math.min(100,requestedVolume))/100:0.35;
let audioContext=null,rouletteClick=null;
const playingSounds=new Set();
function audio(){
 if(!soundVolume)return null;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
   if(!audioContext||audioContext.state==='closed'){audioContext=new Audio();rouletteClick=null;}
   if(audioContext.state==='suspended'){audioContext.resume().catch(()=>{});return null;}
   return audioContext.state==='running'?audioContext:null;
 }catch{return null;}
}
function tone(ctx,frequency,delay,duration,level,type){
 try{const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+delay;
   oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level*soundVolume,start+0.005);gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
   oscillator.connect(gain);gain.connect(ctx.destination);playingSounds.add(oscillator);
   oscillator.onended=()=>{playingSounds.delete(oscillator);oscillator.disconnect();gain.disconnect();};
   oscillator.start(start);oscillator.stop(start+duration+0.01);
 }catch{}
}
function rollSound(){const ctx=audio();if(!ctx)return;
 try{
   // A short filtered noise burst gives a mechanical wheel click instead of a beep.
   if(!rouletteClick){rouletteClick=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*0.035),ctx.sampleRate);const samples=rouletteClick.getChannelData(0);
     for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*0.006));}
   const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=rouletteClick;
   filter.type='bandpass';filter.frequency.value=2200;filter.Q.value=0.8;gain.gain.value=0.55*soundVolume;
   source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);playingSounds.add(source);
   source.onended=()=>{playingSounds.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start();
 }catch{}
}
function winSound(){const ctx=audio();if(!ctx)return;
 // Brass-like octave layers lead into a fuller major chord; no downloaded audio.
 [523.25,659.25,783.99,1046.5].forEach((frequency,i)=>{
   tone(ctx,frequency,i*0.17,0.23,0.25,'triangle');tone(ctx,frequency/2,i*0.17,0.23,0.14,'sawtooth');
 });
 [261.63,329.63,392,523.25].forEach(frequency=>tone(ctx,frequency,0.7,1.1,0.17,'triangle'));
 tone(ctx,130.81,0.7,1.2,0.22,'sine');
}
function stopSounds(){for(const oscillator of playingSounds){try{oscillator.stop();}catch{}}playingSounds.clear();}
// Normal-browser previews may require a gesture; OBS supplies its own audio policy.
window.addEventListener('pointerdown',audio);
const $=id=>document.querySelector('#'+id);
let currentDraw=null,clockOffset=0,lastServerTime=-Infinity,generation=0,rollingTimer=null,localRevealUntil=0,testHideAt=0;
const serverTime=()=>Date.now()+clockOffset;
let seen=new Set(),storageAvailable=true;
try{seen=new Set(JSON.parse(sessionStorage.getItem('paplovag-overlay-seen-v1')||'[]'));}catch{storageAvailable=false;}
function remember(id){seen.add(id);if(seen.size>100)seen.delete(seen.values().next().value);try{sessionStorage.setItem('paplovag-overlay-seen-v1',JSON.stringify([...seen]));}catch{}}
function status(value){$('connection').textContent=value;$('connection').hidden=!value;}
function stop(){generation++;clearTimeout(rollingTimer);rollingTimer=null;stopSounds();$('result').classList.remove('rolling');}
function hidden(d){if(!d)return true;const deadline=Date.parse(d.claim_deadline),claimed=Date.parse(d.claimed_at);
 return d.claim_status==='claimed'?Number.isFinite(claimed)&&serverTime()>=claimed+4000:
   d.test&&((testHideAt>0&&serverTime()>=testHideAt)||(Number.isFinite(deadline)&&serverTime()>deadline));
}
function countdown(){const d=currentDraw;if(hidden(d)){$('result').hidden=true;if(rollingTimer!==null)stop();}
 if(!d){$('claim-clock').hidden=true;return;}$('claim-clock').hidden=false;
 const left=Math.max(0,Math.ceil((Date.parse(d.claim_deadline)-serverTime())/1000));
 $('claim-clock').textContent=d.test?'TESZT – nincs valódi nyertes':d.claim_status==='claimed'?'✓ A nyertes jelentkezett':
   serverTime()<localRevealUntil?'✦ Pörgetés…':left===0?'Nem jelentkezett – újrasorsolás következhet':`${left} mp · Írj bármit a ${d.winner.platform} chatbe!`;
}
function winner(d,confetti){$('winner').textContent=d.winner.display_name;$('moderator').textContent=`${d.winner.platform} · Sorsolta: ${d.actor_name}`;
 if(confetti)winSound();
 if(confetti)for(let i=0;i<65;i++){const piece=document.createElement('i');piece.className='confetti';piece.style.left=`${Math.random()*100}%`;
   piece.style.background=['#b18dff','#e4cbff','#f8d477','#82dab5'][i%4];piece.style.animationDelay=`${Math.random()}s`;document.body.append(piece);setTimeout(()=>piece.remove(),4500);}
}
function reveal(d,replayed){stop();const version=generation;$('result').hidden=false;$('prize').textContent=d.prize;
 $('overlay-heading').textContent=d.test?'OVERLAY TESZT – MINTANEVEK':'PAPLOVAG NYEREMÉNYJÁTÉK';$('moderator').textContent='';
 const originalRemaining=Date.parse(d.reveal_at)-serverTime();
 // A late first delivery still spins the names; it never extends the server claim deadline.
 const remaining=d.test?Math.max(0,Math.min(5000,replayed?originalRemaining:5000)):
   !replayed&&d.claim_status==='awaiting'?Math.max(0,Math.min(5000,Date.parse(d.claim_deadline)-serverTime())):originalRemaining;
 localRevealUntil=serverTime()+Math.max(0,remaining);
 if(remaining>0){$('result').classList.add('rolling');const candidates=Array.isArray(d.candidates)?d.candidates.map(n=>typeof n==='string'?n:n?.display_name).filter(n=>typeof n==='string'&&n.trim()):[];
   const names=candidates.length?candidates:['✦'];let i=1;const started=Date.now();$('winner').textContent=names[0];if(!replayed)rollSound();
   const scheduleTick=()=>{const elapsed=Date.now()-started,delay=70+350*Math.pow(Math.min(1,elapsed/remaining),2.5);
     if(elapsed+delay>=remaining)return;
     rollingTimer=setTimeout(()=>{if(version!==generation||currentDraw?.id!==d.id)return;
       $('winner').textContent=names[i++%names.length];if(!replayed)rollSound();scheduleTick();},delay);
   };scheduleTick();
   setTimeout(()=>{if(version!==generation||currentDraw?.id!==d.id)return;clearTimeout(rollingTimer);rollingTimer=null;$('result').classList.remove('rolling');winner(d,!replayed);countdown();},remaining);
 }else winner(d,!replayed&&d.claim_status!=='expired');
 countdown();
}
function receive(event){const packet=event.detail;if(packet?.protocol!=='paplovag-overlay-v1'||typeof packet.eventId!=='string')return;
 const stamp=Date.parse(packet.serverNow);if(!Number.isFinite(stamp)||stamp<lastServerTime)return;
 const d=packet.draw;if(d!==null&&(!d||typeof d.id!=='string'||typeof d.prize!=='string'||typeof d.actor_name!=='string'||
   typeof d.winner?.display_name!=='string'||!['twitch','youtube','kick'].includes(d.winner.platform)||
   !Number.isFinite(Date.parse(d.created_at))||!Number.isFinite(Date.parse(d.reveal_at))||!Number.isFinite(Date.parse(d.claim_deadline))))return;
 if(d&&currentDraw&&Date.parse(d.created_at)<Date.parse(currentDraw.created_at))return;
 if(d?.id===currentDraw?.id&&currentDraw&&({awaiting:0,expired:1,claimed:2}[d.claim_status]??0)<({awaiting:0,expired:1,claimed:2}[currentDraw.claim_status]??0))return;
 lastServerTime=stamp;clockOffset=stamp-Date.now();status('');
 const changed=currentDraw?.id!==d?.id;currentDraw=d;
 // The server test TTL allows delivery across bot polls; it is not a viewer countdown.
 // Set the presentation deadline once per test ID, so replays cannot keep it visible.
 if(changed)testHideAt=d?.test?serverTime()+9000:0;
 if(!d||hidden(d)){stop();$('result').hidden=true;countdown();return;}
 // A bot replay means it was sent before, not that this Browser Source displayed it.
 // Prefer the browser's receipt history; when storage is unavailable retain the bot guard.
 if(changed){const replayed=seen.has(d.id)||(!storageAvailable&&packet.replay===true);remember(d.id);reveal(d,replayed);}else countdown();
}
window.addEventListener('paplovagModOverlay',receive);
window.addEventListener('obsExit',()=>{stop();$('result').hidden=true;status('OBS kapcsolat megszakadt.');});
// Presentation-only timer: it never contacts Cloudflare and never finalizes a server claim.
setInterval(countdown,250);
if(demo){const now=Date.now();receive({detail:{protocol:'paplovag-overlay-v1',eventId:'demo',serverNow:new Date(now).toISOString(),draw:{
 id:'demo',test:true,created_at:new Date(now).toISOString(),reveal_at:new Date(now+3000).toISOString(),claim_deadline:new Date(now+93000).toISOString(),claim_status:'test',
 prize:'Steam játékkulcs',actor_name:'Paplovag MOD',winner:{display_name:'TavernaLovag',platform:'twitch'},candidates:['TavernaLovag','Paplovag','GarasVadasz','StreamLovag']}}});}
else if(!window.obsstudio)status('Az overlay az OBS Browser Source-ban fogadja a Streamer.bot eseményeit.');
