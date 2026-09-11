const partnerLogoAssets=[
  {match:"nintendo.com",src:"/assets/media-kit/partners/nintendo.svg?v=20260911",alt:"Nintendo"},
  {match:"cenega.hu",src:"/assets/media-kit/partners/cenega.svg?v=20260911",alt:"Cenega"},
  {match:"eneba.com",src:"/assets/media-kit/partners/eneba.svg?v=20260911",alt:"Eneba"}
];
function installPartnerLogos(){
  for(const item of partnerLogoAssets){
    const card=[...document.querySelectorAll(".pg-partner")].find(link=>(link.getAttribute("href")||"").includes(item.match));
    if(!card)continue;
    let host=card.querySelector(".pg-partner-logo,.pg-partner-wordmark");
    if(!host)continue;
    host.className="pg-partner-logo";
    host.style.background=item.match==="eneba.com"?"#4618ac":item.match==="cenega.hu"?"#171b24":"#fff";
    host.innerHTML=`<img src="${item.src}" alt="${item.alt}" loading="eager">`;
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installPartnerLogos,{once:true});else installPartnerLogos();
