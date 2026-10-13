(() => {
 const $=s=>document.querySelector(s),root=$('#view-stream-data');
 const demo=new URLSearchParams(location.search).get('demo')==='1',names={twitch:'Twitch',kick:'Kick'};
 const errors={connection_missing:'Hiányzó platformkapcsolat. A csatornatulajdonos kapcsolja össze a fiókot.',reauthorization_required:'A csatornatulajdonosnak újra engedélyeznie kell a kapcsolatot.',owner_required:'A platformkapcsolatot csak Paplovag engedélyezheti.',platform_busy:'Egy másik művelet fut ezen a platformon. Próbáld újra később.',request_rate_limited:'Túl gyakori kérés. Várj a jelzett ideig.',platform_rate_limited:'A platform kéréskorlátot jelzett. Várj az újrapróbálással.',outcome_unknown:'A platform válasza megszakadt. Az újrapróbálás előbb ellenőrzi a tényleges adatokat.',category_selection_expired:'A kategóriaválasztás lejárt. Keresd ki újra a játékot.',category_not_on_both_platforms:'A kategória nincs meg mindkét platformon.',forbidden:'Nincs megfelelő moderátori jogosultság.',unauthorized:'A belépés lejárt. Jelentkezz be újra.',invalid_title:'A cím 1–140 karakter lehet.',platform_unavailable:'A platform most nem érhető el.',stream_service_unavailable:'Nem sikerült elérni a streamadat-szolgáltatást.',oauth_scope_missing:'Hiányzik a szükséges platformengedély.'};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 let busy=false,loading=false,states={},cards={},picks={},lastIntent=null,refreshAt=0;
 function message(e){return (errors[e.error]||'A művelet nem sikerült.')+(e.retryAfter?` Újrapróbálás ${e.retryAfter} másodperc múlva.`:'');}
 async function request(path,body){const r=await fetch('/api/mod/stream'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
  let data;try{data=await r.json();}catch{throw {error:'stream_service_unavailable'};}if(!r.ok)throw data;return data;
 }
 function setBusy(value){busy=value;root.setAttribute('aria-busy',String(value));root.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.unavailable==='1');$('#stream-common-save').textContent=value?'Módosítás folyamatban…':'Változtatás Twitch-en és Kick-en';}
 function picker(container,key,targets){
  const label=el('label','Új játék/kategória'),input=el('input'),selected=el('p','Nincs új kategória kiválasztva.','stream-category-selected'),clear=el('button','Választás törlése','button secondary'),list=el('div',null,'stream-category-options');
  input.id='stream-category-'+key;label.htmlFor=input.id;input.placeholder='Legalább 3 karakter · pl. Grand Theft Auto';input.autocomplete='off';input.setAttribute('aria-controls',input.id+'-results');list.id=input.id+'-results';list.setAttribute('aria-live','polite');clear.type='button';
  container.append(label,input,selected,clear,list);picks[key]={choice:null,input,selected};let timer,sequence=0;
  clear.addEventListener('click',()=>{picks[key].choice=null;selected.textContent='Nincs új kategória kiválasztva.';input.value='';list.replaceChildren();});
  input.addEventListener('input',()=>{clearTimeout(timer);const seq=++sequence;picks[key].choice=null;selected.textContent='Válassz a keresési találatok közül.';list.replaceChildren();if(input.value.trim().length<3)return;
   timer=setTimeout(async()=>{try{list.textContent='Kategóriák keresése…';const response=demo?{items:[{name:input.value,ids:{twitch:'demo-tw',kick:'demo-kick'},selection:'demo'}],errors:{}}:await request('/categories?q='+encodeURIComponent(input.value.trim()));if(seq!==sequence)return;
    list.replaceChildren();if(!response.items.length)list.append(el('p','Nincs találat.'));
    for(const [p,error] of Object.entries(response.errors||{}))list.append(el('p',names[p]+': '+message(error)));
    for(const item of response.items){const missing=targets.filter(p=>!item.ids[p]),option=el('button',item.name+(missing.length?' · Hiányzik: '+missing.map(p=>names[p]).join(', '):''),'stream-category-option');option.type='button';option.dataset.unavailable=missing.length?'1':'0';option.disabled=missing.length>0||busy;
     option.addEventListener('click',()=>{if(busy)return;picks[key].choice=item;input.value=item.name;selected.textContent=item.name+' · '+targets.map(p=>names[p]).join(' + ');list.replaceChildren();});list.append(option);}
   }catch(e){if(seq===sequence)list.textContent=message(e);}},450);
  });
 }
 function build(){for(const p of ['twitch','kick']){
  const card=el('section',null,'card stream-platform-card'),heading=el('h2',names[p]),status=el('p','Adatok betöltése…'),current=el('div',null,'stream-current'),form=el('form'),label=el('label','Streamcím'),title=el('input'),game=el('div'),save=el('button',names[p]+' mentése','button secondary'),connect=el('a','Csatornatulajdonosi kapcsolódás / újraengedélyezés','stream-connect');
  title.id='stream-title-'+p;title.maxLength=140;label.htmlFor=title.id;connect.href='/api/mod/stream/connect/'+p;save.type='submit';form.append(label,title,game,save);card.append(heading,status,current,form,connect);$('#stream-data-platforms').append(card);cards[p]={status,current,title,save,dirty:false};title.addEventListener('input',()=>cards[p].dirty=true);picker(game,p,[p]);
  form.addEventListener('submit',e=>{e.preventDefault();submit([p],title.value,p);});
 }picker($('#stream-common-category'),'common',['twitch','kick']);}
 function renderPlatform(p,result){states[p]=result;const card=cards[p];card.current.replaceChildren();if(!result.ok){card.status.textContent=message(result);return;}
  const d=result.data;card.status.textContent=(d.live===true?'Élő':d.live===false?'Offline':'Élő állapot nem lekérdezhető')+' · '+(result.cached?'Rövid idejű cache':'Platformról lekérve');
  card.current.append(el('strong',d.title),el('p',d.category.name||'Nincs kategória'),el('small','Ellenőrizve: '+new Date(d.checkedAt).toLocaleTimeString('hu-HU')));
  if(!card.dirty)card.title.value=d.title;
 }
 async function load(force=false){if(loading||busy)return;if(force&&Date.now()<refreshAt){$('#stream-data-status').textContent='Kézi frissítés legfeljebb 30 másodpercenként.';return;}loading=true;$('#stream-data-refresh').disabled=true;$('#stream-data-status').textContent='Platformadatok betöltése…';
  try{const response=demo?{platforms:{twitch:{ok:true,data:{title:'Paplovag · esti kalandok',category:{id:'1',name:'Grand Theft Auto V'},live:true,checkedAt:new Date().toISOString()}},kick:{ok:true,data:{title:'Paplovag · esti kalandok',category:{id:'2',name:'Grand Theft Auto V'},live:false,checkedAt:new Date().toISOString()}}}}:await request(force?'?refresh=1':'');
   for(const [p,result]of Object.entries(response.platforms))renderPlatform(p,result);const oauthError=new URLSearchParams(location.search).get('stream_error');$('#stream-data-status').textContent=oauthError?message({error:oauthError}):'Az adatok nem frissülnek automatikusan.';if(force)refreshAt=Date.now()+30000;
  }catch(e){$('#stream-data-status').textContent=message(e);if(e.retryAfter)refreshAt=Date.now()+e.retryAfter*1000;}finally{loading=false;$('#stream-data-refresh').disabled=false;}
 }
 function showResults(results,intent){const box=$('#stream-data-results');box.replaceChildren();const failed=[];
  for(const [p,result]of Object.entries(results)){const row=el('div',null,'stream-save-result '+(result.ok?'success':'failure'));row.append(el('strong',names[p]+': '),el('span',result.ok?result.changed?'Sikeres módosítás.' : 'Változatlan; nem történt módosítás.':message(result)));box.append(row);
   if(result.ok){if(result.data){cards[p].dirty=false;renderPlatform(p,{ok:true,data:result.data});}if(result.refreshRequired)row.append(el('p','A módosítás sikerült, az új adatok ellenőrzéséhez kézi frissítés szükséges.'));if(result.auditPending)row.append(el('p','A naplóbejegyzés véglegesítése nem sikerült; az előzetes bejegyzés megmaradt.'));}else failed.push(p);
  }
  if(failed.length){const retry=el('button','Újrapróbálás: '+failed.map(p=>names[p]).join(', '),'button secondary');retry.type='button';const wait=Math.max(...failed.map(p=>results[p].retryAfter||0))*1000,availableAt=Date.now()+wait;retry.addEventListener('click',()=>{if(Date.now()<availableAt){$('#stream-data-status').textContent='A platform által kért várakozási idő még nem telt le.';return;}execute({...intent,platforms:failed,requestId:crypto.randomUUID()});});box.append(retry);}
 }
 async function execute(intent){if(busy||loading)return;lastIntent=intent;setBusy(true);$('#stream-data-status').textContent='Mentés folyamatban…';try{const response=demo?{results:Object.fromEntries(intent.platforms.map(p=>[p,{ok:true,changed:true,data:{...states[p].data,title:intent.title??states[p].data.title,category:intent.selection?{id:'demo',name:picks.common.choice?.name||picks[p].choice?.name}:states[p].data.category}}]))}:await request('/save',intent);
  showResults(response.results,intent);$('#stream-data-status').textContent=Object.values(response.results).every(r=>r.ok)?'A művelet befejeződött.':'A platformok eredménye külön látható; a sikeres módosítás megmaradt.';
 }catch(e){$('#stream-data-status').textContent=message(e);const box=$('#stream-data-results');box.replaceChildren();const retry=el('button','Művelet eredményének újraellenőrzése','button secondary');retry.type='button';retry.addEventListener('click',()=>execute(lastIntent));box.append(retry);}finally{setBusy(false);}}
 function submit(targets,title,key){if(busy||loading)return;const selected=picks[key].choice,trim=title.trim();if(!trim&&!selected){$('#stream-data-status').textContent='Adj meg új címet vagy válassz kategóriát.';return;}
  if(selected&&targets.some(p=>!selected.ids[p])){$('#stream-data-status').textContent=errors.category_not_on_both_platforms;return;}
  const changes=trim&&targets.some(p=>!states[p]?.ok||states[p].data.title!==trim);if(!changes&&!selected){$('#stream-data-status').textContent='Nincs módosítás: a cím változatlan.';return;}
  execute({requestId:crypto.randomUUID(),platforms:targets,...(changes?{title:trim}:{}),...(selected?{selection:selected.selection}:{})});
 }
 build();$('#stream-common-form').addEventListener('submit',e=>{e.preventDefault();submit(['twitch','kick'],$('#stream-common-title').value,'common');});$('#stream-data-refresh').addEventListener('click',()=>load(true));
 window.ModStreamData={open:()=>load()};if(!root.hidden)load();
})();
