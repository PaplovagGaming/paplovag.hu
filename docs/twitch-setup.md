# Twitch követőszám – paplovag.hu

A kapcsolat a Kingdom projektben már meglévő Twitch-alkalmazáskulcsokat használja:
`TWITCH_CLIENT_ID` és `TWITCH_CLIENT_SECRET`.

Nem szükséges új secretet generálni vagy átmásolni a paplovag.hu projektbe.
A Kingdom Twitch-bejelentkezésének kódja változatlan.

## Adatút

1. `kingdom.paplovag.hu/api/creator/twitch/public`: szerveroldalon alkalmazástokent kér,
   feloldja a `paplovag` csatornát, és lekéri az összesített követőszámot.
2. `paplovag.hu/api/twitch-statistics`: szerveroldalon átveszi a nyilvános adatot.
   Nem továbbít látogatói cookie-t vagy hitelesítési adatot.
3. A főoldal animált számlálója ezt a helyi végpontot használja.

Mindkét végpont kizárólag a `followers`, `updatedAt` és `stale` mezőket adja vissza.
Tokenek, secret értékek és a követők személyes adatai nem kerülnek a válaszba.

A Kingdom válasza 10 percig, a főoldal proxyválasza 1 percig gyorsítótárazódik.
Így új oldalbetöltéskor jellemzően 10–11 percen belüli adat érkezik.
A főoldal meglévő KV-kötése az utolsó sikeres valódi eredményt megőrzi hiba esetére.

## Ellenőrzés és hibák

Nyisd meg a https://paplovag.hu/ főoldalt, és görgess a statisztikákhoz.
A Twitch-számra mutatva megjelenik a frissítés ideje.

- 503 / `twitch_not_configured`: a Kingdom aktuális production telepítésében
  hiányzik valamelyik Twitch-kulcs. A változók beállítása után új Kingdom-telepítés kell.
- 502 / `twitch_statistics_unavailable`: a Twitch vagy a Kingdom lekérés hibázik,
  és nincs korábbi sikeres mentett adat.
- `stale:true`: utolsó sikeres mentett követőszám, annak eredeti frissítési idejével.

Amíg nincs sikeres eredmény, a korábban megadott 88700 látszik, és a tooltip jelzi,
hogy ez korábban megadott érték.

A meglévő Twitch-alkalmazáson ne generálj új secretet, mert az a bejelentkezést is
megszakíthatja. A kulcsokat nem kell visszaolvasni a Cloudflare-ből: a Kingdom
szerveroldali kódja közvetlenül használja a már beállított értékeket.

## Források

- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
- https://dev.twitch.tv/docs/api/reference/#get-channel-followers
- https://discuss.dev.twitch.com/t/get-followers-count/48066
