# Rebuild

Joc idle (incremental) que corre a la web (PWA a GitHub Pages) i a Android (Capacitor), amb **una sola base de codi**.
Nom: **Rebuild** (repo realbluehead/Rebuild, web a https://realbluehead.github.io/Rebuild/). Canviar-lo vol dir tocar `package.json`, `capacitor.config.ts` (appId/appName), `vite.config.ts` (manifest),
`android/` (namespace/applicationId, millor regenerar-lo) i `GITHUB_REPO` a `src/platform/update.ts`. Fer-ho **abans** de la primera release.

## El joc
Idle d'exploració amb estètica **retro pixelada**. Vista aèria d'un mapa 2D (1024×1024 caselles) que comença tot fosc;
un robot el va descobrint sol, a poc a poc, amb el temps. 4 nivells de zoom (Camí 16 → Comarca 64 → Regió 256 → Continent 1024
caselles de costat); es comença al més proper i el següent es desbloqueja en descobrir el 80% del quadrat del zoom actual.
- Stats (`content/upgrades.ts`, efecte a `core/game.ts` `stats()`): Motor (velocitat), Radar (abast en anells), Bodega (capacitat de càrrega),
  Robots. Passos/s = velocitat × robots. L'or ve de cada casella (terreny × distància) i dels llocs especials (cofres/ruïnes).
- Bodega: els robots carreguen l'or (`cargo`) fins a `capacity()` = càrrega × robots de l'anell. Plens, tornen al campament
  (`trip` home → out → explore, distància = anell + 1, a `TRAVEL_MULT`× la velocitat) i només llavors l'or és del jugador.
  El punt on s'omplen es busca exacte (bisecció), així que `tick` és exacte per a qualsevol dt (hi ha test).
- Objectes (`content/collection.ts`): pàgines, notes i fotos amagades a ~1/90 caselles (`world.item`, `itemRanks`). Es recullen en
  arribar-hi i amb la pestanya Obres es fan llibres (velocitat), discos (or) i àlbums (bodega): bonus ×1,1 per obra, cost ×1,9 cada cop.
- Radar: els objectes fins a `radar` anells més enllà els va a buscar un robot (`trip` 'detour', al pas d'explorar; la casella queda fosca).
  `radarNext` és l'índex del primer objecte que el radar no ha repassat. Al mapa parpellegen fins al doble de l'abast.
- Or per terreny: llegenda a l'ajuda i un toc al mapa diu el terreny i quant val la casella.
- La casella que un robot explora va agafant color (segona meitat del pas; la primera hi camina). Ajuda: botó ? i menú; surt sola a la primera partida.
- Regles dels robots: surten del campament (casella inicial); **només descobreixen la casella contigua** i una casella
  compta com a descoberta quan hi arriben. Si la següent de l'ordre no és contigua, hi caminen (passos sense descobrir).
  Amb N robots, cada anell es reparteix en N arcs; els robots comprats a mig anell s'hi afegeixen a l'anell següent (`ringRobots`).
- El mapa **no es desa**: es regenera del `seed` (`core/world.ts`). L'ordre d'exploració és una expansió Dijkstra des del campament
  (cost per terreny + soroll) recorreguda per anells i angle: la zona explorada sempre és una sola taca connectada (hi ha test).
  L'estat és `walked` (passos) i l'offline és exacte. Si canvia la generació, les partides veuran un altre mapa.
- Format: **sempre telèfon vertical**. Al mòbil omple la pantalla; a l'ordinador és un marc de telèfon 9:19,5 centrat (`#app` a `style.css`).
  Barra de dalt (or, ritme, menú ≡ amb exportar/importar/reiniciar), mapa al mig, millores en graella 2×2 a baix. Les finestres s'obren dins del telèfon.
- Dibuix (`ui/map.ts`): canvas de baixa resolució (~256 px lògics al costat curt) escalat amb píxels nítids; rajoles 16×16 generades per
  codi (`ui/sprites.ts`, paleta pròpia) a prop, color pla de lluny i mipmap 4×4 al zoom 4. Fonts de píxels empaquetades (van offline): `Press Start 2P` per a números i títols (classe/var `--font-num`), `VT323` per al text (dígits clars; Pixelify Sans es va descartar perquè el 5 semblava una S).
- Equilibri actual (sim, `BASE_SPEED` 0,1 passos/s): zoom 2 ~35 min, zoom 3 ~2 h 30, zoom 4 ~7 h, mapa sencer ~17 h (el sim no compra Radar).
  `BASE_SPEED` escala tot el ritme linealment (l'or també ve d'explorar). Per provar: botó «Vel ×N» al mapa (×1 a ×100).

## Ordres
- `npm run dev`: servidor local (Vite). També com a `idle-joc` a `../.claude/launch.json`.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `npm run sim -- <hores>`: simulador d'equilibri (jugador golós), mostra quan s'arriba a cada fita. Fer-lo servir cada cop que es toquin números de `src/content/`.
- `npm run android:apk`: APK de debug a `android/app/build/outputs/apk/debug/`. Cal `JAVA_HOME` del JDK d'Android Studio:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (el Java del sistema no va amb Gradle).
- `npm run release -- patch|minor|major`: puja la versió, etiqueta `vX.Y.Z` i fa push → la CI publica l'APK a Releases.

## Arquitectura
- `src/core/`: simulació **pura** (sense DOM, rellotge ni storage). Tota la lògica nova va aquí i amb test.
  Números grans sempre amb `Decimal` de `core/decimal.ts`. Bucle de pas fix (`TICK_RATE`).
- `src/content/`: dades del joc (generadors, i més endavant millores, fites…). Afegir contingut no hauria de tocar el core.
- `src/save/`: `save.ts` format amb versió + migracions; `offline.ts` progrés mentre no hi eres (per trams, amb límit); `persist.ts` desat amb còpia de seguretat.
  **Si canvia `GameState`: puja `SAVE_VERSION`, afegeix la migració i un test.** Les partides dels jugadors no es poden trencar.
- `src/platform/`: tot el que és diferent entre web i Android (storage, segon pla, notificacions locals, actualitzacions de l'APK).
- `src/ui/`: DOM pla; es construeix un cop i `render()` només actualitza textos.

## Desplegament
- Web: push a `main` → `.github/workflows/web.yml` (lint, test, build amb `BASE_PATH=/<repo>/`) → GitHub Pages.
- Android: etiqueta `v*` → `.github/workflows/android.yml` → APK signat a GitHub Releases. L'app instal·lada consulta
  l'última release i ofereix descarregar-la. `versionCode` es calcula de la versió de `package.json` (1.2.3 → 10203).
- Clau de signatura: `tools/new-keystore.sh` (un sol cop). Fora del repo; secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Si es perd, els mòbils no podran actualitzar.
- Després de canviar el codi web, per provar-lo a Android: `npm run android:sync` (fa build + `cap sync`).
