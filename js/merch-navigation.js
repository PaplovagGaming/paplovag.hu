(function(){
'use strict';
var menus=Array.from(document.querySelectorAll('.merch-dropdown'));
function setOpen(item,open){item.querySelector('.merch-dropdown-toggle').setAttribute('aria-expanded',String(open));item.querySelector('.merch-submenu').hidden=!open;}
function closeOthers(item){menus.forEach(function(other){if(other!==item)setOpen(other,false);});}
menus.forEach(function(item){
var button=item.querySelector('.merch-dropdown-toggle');
button.addEventListener('click',function(){var open=button.getAttribute('aria-expanded')!=='true';closeOthers(item);setOpen(item,open);});
item.addEventListener('pointerenter',function(event){if(event.pointerType==='mouse'&&window.matchMedia('(min-width:1041px)').matches){closeOthers(item);setOpen(item,true);}});
item.addEventListener('pointerleave',function(event){if(event.pointerType==='mouse'&&!item.contains(document.activeElement))setOpen(item,false);});
item.addEventListener('focusout',function(event){if(!item.contains(event.relatedTarget))setOpen(item,false);});
item.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();setOpen(item,false);button.focus();}else if(event.target===button&&event.key==='ArrowDown'){event.preventDefault();closeOthers(item);setOpen(item,true);item.querySelector('.merch-submenu a').focus();}});
});
document.addEventListener('click',function(event){menus.forEach(function(item){if(!item.contains(event.target))setOpen(item,false);});});
})();
