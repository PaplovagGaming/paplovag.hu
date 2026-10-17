
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=readFileSync(new URL('../mod/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../mod/mod.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),calls=[];
 class Node{
  constructor(){this.handlers={};this.children=[];this.dataset={};this._value='';this.textContent='';this.hidden=false;this.disabled=false;this.classList={toggle(){},add(){},remove(){},contains(){return false;}};}
  set value(v){this._value=String(v);}get value(){return this._value;}
  addEventListener(name,fn){this.handlers[name]=fn;}setAttribute(){}removeAttribute(){}
  append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}
  closest(){return this.dataset.action ? {} : null;}
  reportValidity(){return this.valid!==false;}
  fire(name){return this.handlers[name]?.({preventDefault(){}});}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 for(const id of html.matchAll(/id="([^"]+)"/g))get(id[1]);
 const actions=['open','close','draw','reroll','archive','remind'].map(action=>{const n=new Node();n.dataset.action=action;return n;});
 const views=['active','history','audit','stream'].map(view=>{const n=new Node();n.dataset.view=view;return n;});
 const state={active:null,defaults:{claimSeconds:180},entries:[],history:[],audit:[],pending:0,bot:null};
 const document={hidden:false,addEventListener(){},querySelector:q=>get(q),querySelectorAll:q=>q==='[data-action]'?actions:q==='[data-view]'?views:[],createElement:()=>new Node()};
 document.querySelector=q=>get(q.startsWith('#')?q.slice(1):q);
 const context={document,window:{addEventListener(){}},location:{search:'',href:'',origin:'https://paplovag.hu'},URLSearchParams,URL,Date,Intl,crypto:webcrypto,confirm:()=>true,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},navigator:{sendBeacon(){return true;}},fetch:async(url,options)=>{
  calls.push({url,options});
  if(options?.method==='POST')return Response.json({ok:true});
  return Response.json(state);
 }};
 runInNewContext(script.replace(/\ninit\(\);\s*$/,'\nglobalThis.controls={set(next){state={...state,...next};},render,renderClaim,claimSeconds,dirty(value){draftDirty=value;},user(){user={id:"mod",name:"Mod"};}};'),context);
 context.controls.set(state);context.controls.user();
 return {get,actions,controls:context.controls,calls,state,settle:()=>new Promise(r=>setImmediate(r))};
}

test('closed empty game offers manual close without winner instead of a dead-end draw',async()=>{
 const f=fixture();Object.assign(f.state,{active:{id:'empty-game',status:'closed',prize:'Test',keyword:'test',max_tickets:10},entries:[],currentRound:null});
 f.controls.set(f.state);f.controls.render();
 const archive=f.actions.find(b=>b.dataset.action==='archive'),draw=f.actions.find(b=>b.dataset.action==='draw');
 assert.equal(archive.hidden,false);assert.equal(archive.disabled,false);assert.equal(archive.textContent,'Lezárás nyertes nélkül');assert.equal(draw.disabled,true);
 await archive.fire('click');assert.ok(f.calls.some(c=>c.url==='/api/mod/games/empty-game/archive'));
});

test('closed game archive respects eligibility and unresolved purchases',()=>{
 const f=fixture(),archive=f.actions.find(b=>b.dataset.action==='archive');
 f.controls.set({active:{id:'game',status:'closed'},entries:[{tickets:1,excluded:0,display_name:'Test'}]});f.controls.render();assert.equal(archive.disabled,true);
 f.controls.set({entries:[{tickets:0,excluded:0,display_name:'Test'}]});f.controls.render();assert.equal(archive.disabled,false);
 f.controls.set({pending:1});f.controls.render();assert.equal(archive.disabled,true);
});

test('expired last winner offers archive; remaining names require reroll; awaiting winner stays protected',()=>{
 const f=fixture(),archive=f.actions.find(b=>b.dataset.action==='archive'),reroll=f.actions.find(b=>b.dataset.action==='reroll');
 f.controls.set({active:{id:'game',status:'drawn'},entries:[{tickets:1,excluded:1,display_name:'Test'}],currentRound:{id:'r',claim_status:'expired',winner:{display_name:'Test'},claim_deadline:new Date(Date.now()-1000).toISOString()}});
 f.controls.render();assert.equal(archive.disabled,false);assert.equal(reroll.disabled,true);assert.equal(f.get('game-status').textContent,'Nincs több kisorsolható résztvevő – lezárható');
 f.controls.set({entries:[{tickets:1,excluded:0,display_name:'Test'}]});f.controls.render();assert.equal(archive.disabled,true);assert.equal(reroll.disabled,false);
 f.controls.set({entries:[],currentRound:{claim_status:'awaiting',winner:{display_name:'Test'},claim_deadline:new Date(Date.now()+60000).toISOString()}});f.controls.render();assert.equal(archive.disabled,true);
});
test('claim field uses previous game default without overwriting unsaved edits',()=>{
 const f=fixture();f.controls.render();assert.equal(f.get('claim-seconds').value,'180');
 f.get('claim-seconds').value='240';f.get('game-form').fire('input');
 f.controls.set({defaults:{claimSeconds:30}});f.controls.render();assert.equal(f.get('claim-seconds').value,'240');
 f.controls.dirty(false);f.controls.render();assert.equal(f.get('claim-seconds').value,'30');
 f.controls.set({active:{id:'saved',status:'draft',revision:2,prize:'Test',keyword:'test',max_tickets:10,claim_seconds:45}});
 f.controls.render();assert.equal(f.get('claim-seconds').value,'45');assert.equal(f.get('claim-seconds').disabled,false);
 f.controls.set({active:{id:'open',status:'open',revision:3,prize:'Test',keyword:'test',max_tickets:10,claim_seconds:45}});
 f.controls.render();assert.equal(f.get('claim-seconds').disabled,true);
});
test('claim duration travels in actual form submit and invalid forms do not send',async()=>{
 const f=fixture();f.controls.render();f.get('prize').value='Test';f.get('keyword').value='test';f.get('max-tickets').value='10';f.get('claim-seconds').value='75';
 f.get('game-form').fire('input');f.get('game-form').fire('submit');await f.settle();
 const sent=f.calls.find(c=>c.url==='/api/mod/games');assert.ok(sent);assert.equal(JSON.parse(sent.options.body).claimSeconds,75);
 const bad=fixture();bad.get('game-form').valid=false;bad.get('game-form').fire('submit');await bad.settle();assert.equal(bad.calls.length,0);
});
test('claim countdown text follows the stored round deadline',()=>{
 const f=fixture(),now=Date.now(),round={id:'round',reveal_at:new Date(now+7996).toISOString(),claim_deadline:new Date(now+7996+45000).toISOString(),claim_status:'awaiting',winner:{display_name:'Winner',platform:'twitch'}};
 f.controls.set({currentRound:round});f.controls.renderClaim();assert.match(f.get('claim-status').textContent,/45 másodperc/);
 assert.equal(f.controls.claimSeconds(),45);
 assert.match(html,/<input id="claim-seconds"[^>]+min="10"[^>]+max="3600"/);
 assert.ok(!script.includes('90 másodperce lesz'));
});
