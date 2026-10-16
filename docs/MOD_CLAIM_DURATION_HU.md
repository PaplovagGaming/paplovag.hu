# Állítható nyertesi jelentkezési idő

A MOD Center játékbeállításai között a **Nyertes jelentkezési ideje (másodperc)** mező 10–3600 közötti egész értéket fogad el. Az idő a névpörgetés végén, a nyertes nevének felfedésekor indul.

A beállítást a játék létrehozásával vagy a piszkozat mentésével kell elmenteni. A nevezés megnyitása után a mező zárolt: egy folyamatban lévő játék vagy egy már kisorsolt nyertes határideje nem módosítható vele. Az új játék űrlapja a legutóbbi mentett játék értékét használja. Ez szerveroldali, ezért másik moderátornál, új böngészőben vagy újratöltés után is ugyanaz az alapérték jelenik meg. Az első és a régi játékok alapértéke 90 másodperc.

## Adatmodell és kompatibilitás

- API-bemenet: `claimSeconds`; a `mod_games` sorában: `claim_seconds`.
- A `state` aktív nézete `defaults.claimSeconds` mezőt is visszaad. Ha nincs aktív játék, a legutóbb létrehozott játék mentett értékét olvassa, a ROWID szerinti visszafelé keresésből. Nincs új polling vagy külön alapérték-adatbázis.
- A draft mentése meglévő revision ellenőrzéssel történik; az idő változása bekerül az auditba.
- Régi kliens elhagyott mezője új játék esetén örökli az előző értéket, mentéskor megőrzi az adott játék beállítását. Az azonos kérésazonosítóval ismételt létrehozás nem állítja át az időt.
- Minden sorsoláskor és újrasorsoláskor a szerver menti a végleges `claim_deadline = reveal_at + claim_seconds × 1000` értéket. Az ismételt draw-kérés ugyanazt a mentett határidőt adja vissza.
- A chatfelhívás és a MOD-visszaszámlálás is a beállított időt használja. A már eltárolt kör határidejét az új játék alapértéke nem módosítja.
- A meglévő Streamer.bot-adapter és a helyi overlay már a kapott `claim_deadline` értéket használja, ezért ezekben nem szükséges kód- vagy akciómódosítás.
- A súlyozás, a sorsolás, a jegyek, a nevezés, a garaskezelés és az eredményátadás változatlan.

## Élesítési sorrend

1. Alkalmazd a MOD adatbázisán a `migration_082_mod_claim_duration.sql` additív migrációt egyszer. A meglévő sorok 90-es alapértéket kapnak; pénzügyi vagy résztvevőadat nem változik.
2. Telepítsd a MOD backend új verzióját.
3. Telepítsd a MOD weboldal új űrlapját. Ezután frissítsd a moderátori oldalt.
4. Új, még meg nem nyitott játék létrehozásakor ellenőrizd az örökölt értéket; módosítás után mentsd a piszkozatot.

A migráció, a backend és a weboldal éles telepítése nem történt meg a fejlesztési tesztek részeként. A módosítások külön fejlesztési ágakon, felülvizsgálatra előkészítve vannak. A migrációt nem szabad másodszor vakon végrehajtani.

## Ellenőrzés és visszaállítás

A backend célzott tesztjei memóriabeli SQLite-ot és mockolt Twitch-válaszokat használnak. Ellenőrzik az alapérték öröklését, a mentést és revision ütközést, a régi klienseket, a 10 és 3600 másodperces határokat, a hibás értékek elutasítását, a migrációt és a dinamikus határidőt/chatüzenetet/overlay payloadot/újrasorsolást.

A weboldali tesztek a valódi űrlapkódot futtatják DOM-modellel: betöltik az előző értéket, megőrzik a még el nem mentett módosítást frissítéskor, elküldik a mezőt a mentési kérésben, zárolják a megnyitott játékot és dinamikus időt mutatnak. Valódi sorsolás, fizetés vagy élő adatbázis-írás nem történt.

Backend tesztparancs: `node --experimental-loader ./tests/ts-extension-loader.mjs --test tests/mod-api.test.ts tests/mod-core.test.ts`. Weboldal: `node --test tests/*.test.mjs`.

Visszaállításkor a backend és a felület kódváltozását együtt kell visszavonni; az additív oszlop megmaradhat. A `mod_rounds` táblát és a már elmentett határidőket ne írd át. A régi backend a később indított sorsolásokhoz ismét 90 másodpercet használ, ezért a visszaállítást a moderátorokkal egyeztetett időpontban végezd.
