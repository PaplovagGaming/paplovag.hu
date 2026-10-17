# Nyereményjáték lezárása kisorsolható résztvevő nélkül

## Bizonyított hiba

A 2026-10-17-i, csak olvasó éles diagnosztika `closed` állapotú játékot talált: 0 nevező, 0 kisorsolható résztvevő, 0 függő vásárlás és nincs sorsolási kör. A felület ebben az állapotban csak sorsolást kínált, az archiválási API pedig csak draft vagy drawn állapotot fogadott. A sorsolás helyesen `no_eligible_entries` hibát adott, de annak „Minden résztvevő kiesett” szövege üres játéknál félrevezető volt.

## Javítás

- A nevezések egyeztetése után lezárt (`closed`) játék kézzel archiválható nyertes nélkül, ha nincs pozitív jegyszámú, nem kizárt résztvevő és nincs `reserved` vagy `unknown` vásárlás.
- A szerver újraellenőrzi ezeket a feltételeket az állapotváltó SQL-utasításban is. Párhuzamos adatváltozás esetén nincs jogosulatlan lezárás.
- A meglévő audittrigger rögzíti a lezárást. Nem keletkezik új sorsolás, nyertes, chat- vagy overlayesemény, jegy- vagy pénzmódosítás.
- A korábbi, utolsó nyertes lejárata utáni lezárás és a jelentkezett nyertes lezárása megmarad. Aktív jelentkezési határidő vagy további sorsolható nevek mellett nincs megkerülő lezárás.
- A felület azonos jegyszám/kizárás feltételt használ; az üres játékban a sorsolás tiltott, a „Lezárás nyertes nélkül” használható. A nulla jegyes sor nem számít sorsolható résztvevőnek.

Nincs adatbázis-migráció. Először a backend, utána a weboldal telepítendő. A már beragadt játékot a moderátor az új gombbal zárja le; a javítás nem archivál automatikusan valódi játékot. A moderátori hitelesítés és Origin-védelem változatlan.

## Tesztelés és visszaállítás

A hiba a javítás előtt izolált API- és felülettesztben reprodukálható volt. Tesztek: üres játék lezárása és új játék indítása; megmaradó résztvevők; reserved/unknown vásárlás; párhuzamos nevezőváltozás; utolsó nyertes kiesése; aktív határidő; nulla jegy; a tényleges gomb `/archive` végpontot hív. Minden teszt ideiglenes memóriabeli adatbázist és mockolt szolgáltatást használ.

Backend: `node --experimental-loader ./tests/ts-extension-loader.mjs --test tests/mod-api.test.ts tests/mod-core.test.ts`.
Weboldal: `node --test tests/*.test.mjs`.

Visszaállítás: a javítás backend- és felületcommitját együtt kell visszavonni. Az adatbázist, sorsolásokat, vásárlásokat és korábban archivált játékokat nem szabad visszaírni. A módosítás előtti helyi másolat: `outputs/mod-empty-close-backup-20261017-102716`.
