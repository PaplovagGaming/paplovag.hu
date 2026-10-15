# MOD OBS overlay helyi megjelenítésre költöztetése

A Nyereményjáték adminisztrációja, nevezése, súlyozása, sorsolása és az eredmény továbbítása a meglévő MOD és Streamer.bot útvonalon marad. Csak az OBS-hez tartozó webes kezelőnézet és a weboldalon tárolt statikus megjelenítő kerül ki. A helyi Paplovag Overlay Editor tartalmazza az eredeti névpörgető megjelenítőt és a két eredeti WAV-ot.

Az Editor Nyereményjáték widgetjének **Overlay teszt – mintanevek** gombja helyi, szimulált eseményt futtat az Editorban. A tényleges OBS Browser Source a Streamer.bot által a meglévő `paplovagModOverlay` vendor-eseményben küldött, már kisorsolt eredményt jeleníti meg. A helyi megjelenítő nem kér Cloudflare API-adatot. Az adminisztrációs és sorsolási Cloudflare/Kingdom API-k változatlanok; az általános `/api/mod/*` Pages proxy ezért megmarad.

**Egyesítés előtti kapu:** ellenőrizd külön OBS-tesztjelenetben a helyi `http://192.168.1.28:3888/overlay.html` címet a publikált Nyereményjáték widgettel, a valódi bot-eseményből megjelenő nyertest, a két hangot, az átlátszó hátteret és az ismételt esemény kezelését. A meglévő éles OBS Browser Source címét csak ezután cseréld kézzel. Amíg régi `/mod/overlay/` címre mutat éles OBS-forrás, az ezt törlő weboldali változat nem telepíthető biztonságosan.

Visszaállítás: a weboldal cleanup Git változtatását revertálni kell, vagy a régi commitot visszaállítani; a helyi Editor kódjának mentése külön található. A weboldali munkapéldány kiinduló commitja: `f5ad74597263e1ebff011221d3ad89b026fadb73`.
