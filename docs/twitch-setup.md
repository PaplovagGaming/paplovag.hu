# Twitch követőszám – paplovag.hu

A főoldal a Kingdom már meglévő Twitch-kapcsolatát használja.
Nem kell új secretet generálni vagy kulcsot másolni a paplovag.hu projektbe.

- A `paplovag-kingdom` Cloudflare projektben a `TWITCH_CLIENT_ID` és
  `TWITCH_CLIENT_SECRET` hitelesíti a szerveroldali kérést.
- A `https://kingdom.paplovag.hu/api/creator/twitch/public` végpont csak
  `followers`, `updatedAt` és `stale` mezőket ad vissza.
- A főoldal böngészője ezt a nyilvános végpontot kéri le, cookie és hitelesítési adat nélkül.
  A CORS-válasz engedélyezi a `https://paplovag.hu` és `https://www.paplovag.hu` eredeteket.
- A Kingdom válasza 10 percig gyorsítótárazódik; új oldalbetöltéskor az aktuális
  gyorsítótárazott adat töltődik be.
- A Twitch bejelentkezési kódja változatlan.

A `/api/twitch-statistics` régi főoldali cím a Kingdom végpontjára irányít át.

## Ellenőrzés

Nyisd meg a https://paplovag.hu/ főoldalt, és görgess a statisztikákhoz.
A Twitch-számra mutatva látható a frissítés ideje.

503 / `twitch_not_configured`: valamelyik kulcs hiányzik a Kingdom production
telepítéséből. A Cloudflare-változók módosítása után új Kingdom-telepítés kell.

502 / `twitch_statistics_unavailable`: a Twitch API-kérés hibázik.
A főoldal ilyenkor a korábban megadott 88700-at jelzi, megfelelő tooltippel;
ez nem friss, lekért adat.

A Secret értékét nem kell visszaolvasni. A szerveroldali kód közvetlenül használja
a meglévő változókat; tokenek és követőlisták nem kerülnek a böngészőbe.
