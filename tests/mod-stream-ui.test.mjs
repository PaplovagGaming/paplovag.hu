import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../mod/stream-data.js',import.meta.url),'utf8');
async function fixture(save){
 const ids=new Map();
 class Node {constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.dataset={};this.value='';this.hidden=true;this.disabled=false;this._text='';}set id(v){this._id=v;ids.set(v,this);}get id(){return this._id;}set textContent(v){this._text=v;this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this._text='';}setAttribute(){}addEventListener(name,fn){this.handlers[name]=fn;}querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...n.querySelectorAll(tag)]);}fire(name){return this.handlers[name]?.({preventDefault(){}});}}
 const root=new Node('section');root.id='view-stream-data';
 for(const [id,tag]of [['stream-data-refresh','button'],['stream-data-status','p'],['stream-data-platforms','div'],['stream-common-form','form'],['stream-common-title','input'],['stream-common-category','div'],['stream-common-save','button'],['stream-data-results','div']]){const n=new Node(tag);n.id=id;root.append(n);}
 const cards={twitch:{ok:true,data:{title:'Old Twitch',category:{id:'1',name:'Game'},live:true,checkedAt:new Date().toISOString()}},kick:{ok:true,data:{title:'Old Kick',category:{id:'2',name:'Game'},live:false,checkedAt:new Date().toISOString()}}};const calls=[],window={};
 runInNewContext(source,{document:{querySelector:q=>ids.get(q.slice(1)),createElement:tag=>new Node(tag)},location:{search:''},window,URLSearchParams,AbortSignal,Date,crypto:webcrypto,setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/save'))return Response.json(await save(JSON.parse(options.body),calls));if(url.includes('/categories'))return Response.json({items:[{name:'Shared',ids:{twitch:'10',kick:'20'},selection:'signed-shared'},{name:'Missing',ids:{twitch:'11'},selection:'signed-missing'}],errors:{}});return Response.json({platforms:cards});}});
 await window.ModStreamData.open();return {ids,calls,root,buttons:()=>root.querySelectorAll('button'),settle:()=>new Promise(r=>setImmediate(r))};
}
test('actual UI reports partial success and retries only the failed platform',async()=>{
 let writes=0;const f=await fixture(async intent=>{writes++;return {results:writes===1?{twitch:{ok:true,changed:true,data:{title:intent.title,category:{id:'1',name:'Game'},checkedAt:new Date().toISOString()}},kick:{ok:false,error:'platform_unavailable'}}:{kick:{ok:true,changed:true}}};});
 f.ids.get('stream-common-title').value='New title';f.ids.get('stream-common-form').fire('submit');await f.settle();
 assert.match(f.ids.get('stream-data-results').textContent,/Twitch: Sikeres/);assert.match(f.ids.get('stream-data-results').textContent,/Kick:/);
 const retry=f.buttons().find(b=>b.textContent==='Újrapróbálás: Kick');assert.ok(retry);retry.fire('click');await f.settle();
 const saves=f.calls.filter(c=>c.url.endsWith('/save')).map(c=>JSON.parse(c.options.body));assert.deepEqual(saves[0].platforms,['twitch','kick']);assert.deepEqual(saves[1].platforms,['kick']);assert.notEqual(saves[0].requestId,saves[1].requestId);
});
test('saving is disabled while in-flight and unavailable common categories stay disabled afterward',async()=>{
 let release;const pending=new Promise(r=>release=r);const f=await fixture(()=>pending);
 const search=f.ids.get('stream-category-common');search.value='Shared';search.fire('input');await f.settle();
 const missing=f.buttons().find(b=>b.textContent.includes('Missing'));assert.equal(missing.disabled,true);
 f.ids.get('stream-common-title').value='New';f.ids.get('stream-common-form').fire('submit');assert.equal(f.ids.get('stream-common-save').disabled,true);
 f.ids.get('stream-common-form').fire('submit');assert.equal(f.calls.filter(c=>c.url.endsWith('/save')).length,1);
 release({results:{twitch:{ok:true,changed:true},kick:{ok:true,changed:true}}});await f.settle();assert.equal(f.ids.get('stream-common-save').disabled,false);assert.equal(missing.disabled,true);
});
