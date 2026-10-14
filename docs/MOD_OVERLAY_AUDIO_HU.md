# OBS overlay hangok

A névpörgetéshez a felhasználó által megadott `porgetes.wav` tartozik (352 591 hangminta, 44 100 Hz; 7,99526 másodperc). A pörgetés hossza 7996 ms, a hang hosszától kevesebb mint 1 ms-ra. A nevek fokozatosan lassulnak. A név felfedésekor, a konfetti indulásával együtt a megadott `nyertes.wav` szól (113 468 hangminta, 44 100 Hz; 2,57297 másodperc). Az adminoldali felfedés szerveroldali ideje szintén 7996 ms; utána a nyertesnek 90 másodperce van jelentkezni. Tesztnél és valódi sorsolásnál ugyanaz a hangkezelés fut. Az ismételt esemény, a korábban megjelenített kör visszaállítása és a nyertes jelentkezése nem indít új lejátszást.

A két WAV saját statikus fájlként kerül kiszolgálásra a `/mod/overlay/sounds/` könyvtárból. Az eredeti fájlokat változtatás nélkül másoljuk be. Első pörgetéskor mindkettőt előtöltjük, későbbi sorsoláskor ugyanazokat a lejátszókat használjuk újra. A pörgetési WAV egyszer indul, nem ismétlődik névváltásonként; a nyertesi WAV indításakor a pörgetési lejátszót megállítjuk. Megszakításkor mindkét lejátszót leállítjuk. Nincs külső hangszolgáltatás, új API-polling vagy botmódosítás. A WAV-ok betöltése egy-egy statikus erőforráskérés, a további lejátszások nem kérnek új API-adatot. Alapértelmezett relatív hangerő: 35%. A vizuális megjelenítés hanghiba esetén is működik.

## OBS beállítás

1. A meglévő overlay böngészőforrásán egyszer Refresh cache of current page.
2. Ha külön kevernéd: a böngészőforrás tulajdonságainál Control audio via OBS / Hang vezérlése OBS-en keresztül. Az OBS hangkeverőjében ellenőrizd a némítást és a hangerőt.
3. Ha helyben is hallani szeretnéd, az Advanced Audio Properties / Speciális hangtulajdonságok alatt válassz megfelelő monitorozást. Kerüld a dupla hangot az asztali hangrögzítés és a forrás monitorozása között.
4. MOD Center → OBS overlay → Overlay teszt. A közel 8 másodperces pörgetés alatt a `porgetes.wav`, majd a konfettinél a `nyertes.wav` szól; a teszt 4 másodperccel később eltűnik.

A meglévő URL használható. Opcionálisan a queryben `sound=0` némít, a `volume=0`–`volume=100` beállítja a relatív hangerőt. Ezek a paraméterek a `#` előtti részbe kerüljenek; a meglévő azonosítót őrizd meg, és ne oszd meg.

Normál böngészős mintanézetben az automatikus hangindítást a böngésző blokkolhatja; ilyenkor kattints a lapra. Az OBS tényleges hangkimenetét a helyi Overlay teszttel kell ellenőrizni.

Források: [Web Audio útmutató](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [OBS Browser Source](https://obsproject.com/kb/browser-source).

Ellenőrzés: 40 frontendteszt és Pages Functions build. A hangtesztek ellenőrzik a WAV-ból számított időt, mindkét fájl egyszeri előtöltését és lejátszását, a konfetti és a nyertesi hang közös indítását, a némítást, hangerőt, újratöltést, megszakításkor a hangok leállítását, lejátszási hiba melletti megjelenítést és a nulla overlay API-kérést. A tesztek szimulált Audio lejátszót használnak; az OBS hangkeverője helyi ellenőrzést igényel.
