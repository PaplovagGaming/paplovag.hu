# Twitch követőszám bekötése – paplovag.hu

A kód a főoldalon a `paplovag` Twitch-csatorna összes követőjét jeleníti meg.
Az `/api/twitch-statistics` szerveroldali végpont intézi a hitelesítést és a lekérést.
A böngészőbe csak a követőszám, a frissítés ideje és az elavultság jelzése jut.

## Egyszeri beállítás

1. Nyisd meg a https://dev.twitch.tv/console/apps címet, lépj be, majd válaszd a
   **Register Your Application** gombot. Ha a Twitch kéri, igazold az e-mail-címet és
   állítsd be a kétlépcsős hitelesítést.
2. Hozz létre egy külön alkalmazást:
   - Name: például `Paplovag Website Statistics` (ha foglalt, adj egyedi nevet).
   - OAuth Redirect URLs: `https://paplovag.hu/`.
   - Category: `Website Integration`.
   - Client Type: `Confidential`.
   A redirect URL a regisztrációhoz kell; ez a szerverek közötti kapcsolat nem használ
   böngészős OAuth-visszahívást.
3. Az alkalmazás **Manage** nézetében másold ki a **Client ID** értéket, és hozz létre
   **New Secret** segítségével egy **Client Secret** értéket. Új alkalmazást használj,
   mert egy meglévő alkalmazás secretjének újragenerálása érvényteleníti a régit.
4. Cloudflare → **Workers & Pages** → **paplovag** → **Settings** →
   **Variables and Secrets**, **Production** környezet:
   | Név | Típus | Érték |
   | --- | --- | --- |
   | `TWITCH_CLIENT_ID` | Secret | Twitch Client ID |
   | `TWITCH_CLIENT_SECRET` | Secret | Twitch Client Secret |
5. Mentsd a beállításokat, majd a **Deployments** oldalon indíts új production
   telepítést (**Retry deployment**). A már futó telepítés nem kapja meg visszamenőleg
   az új secret értékeket.

A Client Secret értékét ne tedd GitHubra, ne írd a weboldal JavaScript-kódjába,
és ne küldd el chatben. A titkos értékeket közvetlenül a Cloudflare-ben add meg.

## Ellenőrzés

Új telepítés után nyisd meg a https://paplovag.hu/ főoldalt, és görgess a
statisztikákhoz. A Twitch követőszám automatikusan betölt; egérrel rámutatva látszik
a frissítés ideje.

A https://paplovag.hu/api/twitch-statistics végpont siker esetén ilyen alakú választ ad
(a számok itt csak példák):

```json
{"followers":12345,"updatedAt":"2026-09-30T11:00:00.000Z","stale":false}
```

- HTTP 503 + `twitch_not_configured`: a két secret közül valamelyik hiányzik
  a production telepítésből; ellenőrizd a környezetet és telepíts újra.
- HTTP 502 + `twitch_statistics_unavailable`: nincs lekérhető friss vagy mentett
  adat. Ellenőrizd az alkalmazás típusát, a két értéket és hogy ugyanahhoz a Twitch
  alkalmazáshoz tartoznak-e.
- `stale:true`: a Twitch most nem válaszolt; az utolsó valóban lekért követőszám
  jelenik meg, annak eredeti dátumával.

A sikeres válasz legfeljebb 10 percig kerül az edge gyorsítótárba; ez nem másodpercenként
frissülő számláló. A következő oldalbetöltés az aktuális gyorsítótárazott adatot használja.
A YouTube és Twitch lekérés egymástól független.

A meglévő `MEDIA_KIT_KV` vagy `KV` kötésben csak egy nyilvános követőszám-pillanatkép
mentődik. A Twitch token kizárólag a szerver memóriájában él, lejáratkor újragenerálódik;
401 esetén a lekérés egy új tokennel egyszer megismétlődik.

A beállításig a korábban megadott 88700 marad látható, a hozzá tartozó tooltip pedig
jelzi, hogy a kapcsolat aktiválásra vár. Ez nem ellenőrzött, friss Twitch-adat.

## Források

- https://dev.twitch.tv/docs/authentication/register-app/
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
- https://dev.twitch.tv/docs/api/reference/#get-channel-followers
- https://discuss.dev.twitch.com/t/get-followers-count/48066
- https://developers.cloudflare.com/pages/functions/bindings/
