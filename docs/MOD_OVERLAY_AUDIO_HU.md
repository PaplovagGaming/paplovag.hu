# OBS overlay hangok

A névpörgetéshez mechanikus, rulettjellegű kattogás tartozik. A nevek és a hangok együtt lassulnak: az 5 másodperces pörgetés elején kb. 70 ms, a végén kb. 400 ms telik el a kattanások között. A konfetti indulásakor a felhasználó által választott [winning-sfx.mp3](https://www.myinstants.com/media/sounds/winning-sfx.mp3) szól, kb. 1,5 másodpercig. Tesztnél és valódi sorsolásnál ugyanaz a hangkezelés fut. Az ismételt esemény, a korábban megjelenített kör visszaállítása és a nyertes jelentkezése nem indít új lejátszást.

A kattogás helyben, egy újrafelhasznált rövid szűrt zajmintából készül. A választott MP3 saját statikus fájlként kerül kiszolgálásra: `/mod/overlay/sounds/winning-sfx.mp3` (24 587 bájt). Első pörgetéskor előtöltjük, későbbi sorsoláskor ugyanazt a lejátszót használjuk újra. Nincs Myinstants-hívás lejátszás közben, új API-polling vagy botmódosítás. A betöltés egy kis statikus erőforráskérés, a további lejátszások nem kérnek új API-adatot. Alapértelmezett relatív hangerő: 35%. A vizuális megjelenítés hanghiba esetén is működik.

## OBS beállítás

1. A meglévő overlay böngészőforrásán egyszer Refresh cache of current page.
2. Ha külön kevernéd: a böngészőforrás tulajdonságainál Control audio via OBS / Hang vezérlése OBS-en keresztül. Az OBS hangkeverőjében ellenőrizd a némítást és a hangerőt.
3. Ha helyben is hallani szeretnéd, az Advanced Audio Properties / Speciális hangtulajdonságok alatt válassz megfelelő monitorozást. Kerüld a dupla hangot az asztali hangrögzítés és a forrás monitorozása között.
4. MOD Center → OBS overlay → Overlay teszt. Az 5 másodperces pörgetés alatt kattogás, majd a konfettinél rövid dallam várható; a teszt 4 másodperccel később eltűnik.

A meglévő URL használható. Opcionálisan a queryben `sound=0` némít, a `volume=0`–`volume=100` beállítja a relatív hangerőt. Ezek a paraméterek a `#` előtti részbe kerüljenek; a meglévő azonosítót őrizd meg, és ne oszd meg.

Normál böngészős mintanézetben az automatikus hangindítást a böngésző blokkolhatja; ilyenkor kattints a lapra. Az OBS tényleges hangkimenetét a helyi Overlay teszttel kell ellenőrizni.

Források: [Web Audio útmutató](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [OBS Browser Source](https://obsproject.com/kb/browser-source).

Ellenőrzés: 39 frontendteszt és Pages Functions build. A hangtesztek ellenőrzik a kattogás lassulását, az MP3 előtöltését és egyszeri indítását, a némítást, hangerőt, újratöltést, megszakításkor a hangok leállítását, lejátszási hiba melletti megjelenítést és a nulla overlay API-kérést. Az MP3 MPEG-kereteinek ellenőrzése szerint a fájl kb. 1,54 másodperces. A tesztek szimulált AudioContextet és Audio lejátszót használnak; az OBS hangkeverője helyi ellenőrzést igényel.
