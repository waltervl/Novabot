# map.pgm occupancy flow — CSV-driven, NOT SLAM (novabot_mapping)

**Datum:** 2026-06-19
**Context:** Op David's maaier (LFIN2231000633) komt een **occupied verticale stripe op x≈-25**
steeds terug in `map.pgm` — hij snijdt map1 doormidden zodat return-home faalt. Het bleek
**deterministisch uit de CSV-data** te worden gegenereerd: terug na CSV-inlezen, na `save_map`
(bijv. channel toevoegen), en na server-restore/apply-flows. Een gepatchte `map.pgm` wordt
daarom telkens overschreven.

Eerdere (foute) theorie: "map.pgm = 1x uit SLAM (`save_map type:1`)". **Ontkracht** — zie hieronder.

## Conclusie

`map.pgm` is een **render van een occupancy-grid die de `novabot_mapping`-node opbouwt uit de
CSV-bestanden** (`*_work.csv`, `*_obstacle.csv`, `*_unicom.csv` + `map_info.json`). Er is **geen
persistente SLAM-state** (geen `/userdata/novabot_slam/`, geen `.pbstream`, geen map-load-param —
de enige map-param is `empty_map.yaml`). De stripe is een **gevulde, geïnflateerde polygon**,
vrijwel zeker een **unicom-area** die als dunne sliver bij x≈-25 wordt gevuld.

## De keten (met bewijs)

Binary: `install/novabot_mapping/lib/novabot_mapping/novabot_mapping` (ARM aarch64, **niet gestript**),
draaiend als node `novabot_mapping` (`novabot_mapping_launch.py`). Class `NovabotMapping`.

1. **CSV → polygon**: `readAllCsvData` / `readCsvToArea` / `readObstacleFile` /
   `readNotRelateCsvData` / `readChildMapData`.
2. **Unicom-areas genereren**: `chargingPileUnicomGen(Pose, Polygon)` (laadpaal→map unicom) en
   `unicomAeraOutsideDeal(Polygon, int)` (verwerkt het buiten-work-area deel = de outside-filter).
   Geometrie via **ClipperLib** (polygon-clipping) + `cv::pointPolygonTest` (inside/outside) +
   `hypotf`/`sqrt`.
3. **Inflatie**: `expandPolygon(...)` — aangeroepen vanuit `saveScanData` (0x5f5d8) en
   `mappingCallback`.
4. **Rasteren**: de enige teken-primitief is **`cv::fillPoly`** (+ `cv::circle`) — geïnflateerde
   polygonen worden in de **`inflation_grid`** gevuld.
5. **Render**: `save_map type:1` (stock) schrijft de grid → `map.pgm` (+ `.png`/`.yaml`).

### Bewijs (symbolen + strings)

```
# functie-adressen (nm)
0x47c78 NovabotMapping::chargingPileUnicomGen(Pose, Polygon)
0x53488 NovabotMapping::unicomAeraOutsideDeal(Polygon, int)
0x594d0 NovabotMapping::expandPolygon(...)            # inflatie
0x5f278 NovabotMapping::saveScanData()               # roept expandPolygon (0x5f5d8)
0x4dd90 NovabotMapping::readAllCsvData(...)
0x4c7a8 NovabotMapping::readCsvToArea(...)

# enige cv teken-primitieven in de binary
cv::fillPoly(...)        # vult areas in de grid
cv::circle(...)          # dock-disc / punt

# chargingPileUnicomGen roept: cv::pointPolygonTest, hypotf, sqrt, ClipperLib::IntPoint, ifPointInArea

# strings
maps/home0/csv_file/map_info.json
read work csv file: %s   /  read obstacle:%s, size:%d  /  open csv file fail
build unicom area starting near charging pile  /  ... starting in map
now map is overlaping other unicom area  /  ... charge unicom area
inflation_grid_:%d
map_num: %d, child_map_num: %d, unicom_num: %d
```

### Waarom de stripe in de GLOBALE map.pgm zit maar niet in per-zone map1.pgm
De per-zone `mapN.pgm` worden door de custom `regenerate_per_map_files` **gemaskeerd** uit de
globale `map.pgm` (alleen de zone-regio). De x≈-25 unicom-area-sliver valt buiten map1's masker →
`map1.pgm` is schoon, maar de globale `map.pgm` (waar alle unicom-areas samenkomen) heeft de stripe.

## Wat triggert de regen (stripe komt terug)
- **Maaier (stock)**: `save_map type:1` aan het eind van elke mapping-operatie (kanaal opnemen).
- **Server**, alleen als de bundel **geen raster** bevat: `applyVerbatimToMower` (`mapSync.ts:647`),
  restore-and-realign (`adminStatus.ts:1535`), map-edit push (`mapEdit.ts:242`).
- **NIET** bij mower-connect (beta-safety, `mapSync.ts:764`) en niet periodiek.

## Fix-richtingen
1. **Bron-CSV opschonen**: de unicom-CSV vinden die de kwaaie area produceert (gerichte bisect:
   3 unicoms — map0tomap1, map0tocharge, map1tomap2) en die corrigeren/verwijderen. LET OP:
   `chargingPileUnicomGen` kan een laadpaal-unicom **auto-genereren** (niet uit een CSV) — als de
   bisect de stripe niet wegneemt, zit het in de auto-generatie.
2. **Robuust**: `map.pgm` níét uit deze grid renderen maar uit de **work-polygon**
   (`generate_empty_map`, bewezen schoon) — dan bereikt een unicom-sliver nooit meer `map.pgm`.

## Bisect-resultaat (2026-06-19)
- **`save_map type:1` rendert de IN-MEMORY grid; het herleest de CSV's NIET.** Test: map0tomap1
  unicom `.disabled` + `save_map` → `map.pgm` md5 ongewijzigd (`ec9ec54d`). De grid wordt bij
  **node-start** (novabot_mapping, draait sinds 16 juni) uit de CSV's opgebouwd; `save_map` rendert
  alleen. Een CSV-disable bisect vereist dus een **node-restart per stap** (risicovol op productie).
- **Unicom-sizes op de maaier**: map0tomap1 csv=110 (x≈-5), map0tocharge csv=32 (dock),
  **map1tomap2 csv=0** (x3=144). Geen enkele unicom-CSV ligt op x≈-25.
- **map1tocharge + map2tocharge zijn `.removed`.** → de binary genereert vrijwel zeker zélf
  laadpaal-unicoms voor map1/map2 via `chargingPileUnicomGen` (auto-gen bij ontbrekende CSV). Die
  auto-gen areas zitten in GEEN CSV → niet via disable-bisect te vinden, alleen te vermijden.

## Conclusie root cause (decompile + data)
De x≈-25 stripe is een **unicom-area polygon** (gevuld + geïnflateerd), hoogstwaarschijnlijk een
**auto-gegenereerde laadpaal-unicom voor map1/map2** (omdat map1tocharge/map2tocharge verwijderd
zijn). Deterministisch uit de CSV-state, geen SLAM.

## Aanbevolen fix
**Robuust + bisect niet nodig:** `map.pgm` níét uit novabot_mapping's grid renderen maar uit de
**work-polygon** (`generate_empty_map`, bewezen schoon — alleen work-fill + obstacles, geen
unicom-areas). Dan bereikt geen unicom-sliver ooit `map.pgm`, bij elke regen schoon.
- Server: in restore/apply `generate_empty_map` i.p.v. `save_map type:1`.
- Firmware: na de stock mapping-`save_map` map.pgm herrenderen uit de work-polygon.

Optionele bevestiging auto-gen-hypothese: één node-restart met map1tocharge/map2tocharge hersteld
(geen auto-gen) → rebuild → render → stripe weg? (vereist productie-restart).

## Decompile-vervolg (2026-06-19) — x=-25 herkomst

### `chargingPileUnicomGen` (0x47c78) = laadpaal→map corridor
- Aangeroepen vanuit de **mapping-service-flow** (`mappingCallback`-regio, call-site 0x63994), NIET
  bij een passieve rebuild.
- Geometrie (0x47ce4–0x47d78): `fsub/fmul/fsqrt/hypotf` (afstanden vanaf de paal), `fcmpe d12,d13`
  (afstand vs drempel), `fdiv s10/s11,…,s0` (**normaliseren → eenheidsvector/richting**),
  `fmov d1,#4.0` + `fadd` (stap-aantal), dan `push_back Point32` in een lus.
- ⇒ het **stapt een lijn van punten vanaf de dock (0,0) in één richting** richting een map = een
  corridor. Voor map1/map2 (ver, x≈-30) loopt die corridor van (0,0) dwars de tuin door, **langs
  x≈-25**. Gedilateerd + gevuld = de stripe.
- Past op "komt terug bij channel-add/save_map" (= mapping-op → mappingCallback → chargingPileUnicomGen).

### Re-read / rebuild trigger
`readAllCsvData` (CSV→grid rebuild) wordt aangeroepen door: `detectMapIsOverlaping`,
**`mapControlCallback` (MappingControl service)**, `mappingCallback`. `mapControlCallback`
herbouwt WEL uit de CSV's maar roept `chargingPileUnicomGen` NIET aan.

**`MappingControl.srv`**: `{map_file_name, child_map_file_name, obstacle_file_name,
unicom_area_file_name, type}`. Control-types (binary): `CLEAR_REBUILD_MAP`, `REBUILD_SELECT_MAP`,
`ADD_NEW_CHILD_MAP`, `DELETE_CHILD_MAP`, `ADD_NEW_MAP`, `DELETE_MAP`, `ADD_NEW_UNICOM_AREA`,
`DELETE_UNICOM_AREA`, `ADD_NEW_OBSTACLE`, `DELETE_OBSTACLE`, `ADD_CHARGING_UNICOM_AREA`, `EDIT_MAP`.

### Belangrijke ontdekking over save_map
`save_map type:1` rendert de **in-memory grid** (geen CSV re-read). Test: map0tomap1 `.disabled`
+ save_map → map.pgm md5 ONGEWIJZIGD (`ec9ec54d`). De grid wordt bij node-start (of via een
MappingControl-rebuild) opgebouwd; save_map rendert alleen.

### Plan (zonder whole-stack restart)
Een **MappingControl-rebuild** (re-read uit huidige CSV's, removed charge-unicoms worden niet
ingelezen, chargingPileUnicomGen draait niet) → daarna `save_map type:1` (render) →
`regenerate_per_map_files` (per-maps). Resultaat: map.pgm zonder de map1/map2 charge-corridors.
Eerst de rebuild-branch in `mapControlCallback` checken op data-verlies ("clear").

### MappingControl type-dispatch (0x55290+) + veiligheid
`mapControlCallback` roept `remove@plt` (4×) + `cleanDir` (2×) aan → meerdere branches **verwijderen
bestanden**. Dispatch op `type` (w2): 1→0x55910, 2→0x556d8, 3→0x559d0, 4→0x55b08, 5→0x555a0,
6→0x56210, 7→0x56014, 8→0x562ec, 9→0x55bf4, 10→0x5658c, **11→fall-through naar 0x5530c**.
- type 1 (CLEAR_REBUILD) → `cleanDir` (wist dir). types 4/6/9/10 → `remove`/`cleanDir`.
- De enige **re-read-ZONDER-delete** branch (0x5530c: `readAllCsvData` + `getRobotPose`) = **type 11**.
- ⇒ MappingControl blind triggeren is riskant (verkeerde type wist bestanden) → daarom restart gekozen.

### Restart-aanpak (gekozen, user-akkoord 2026-06-19)
`systemctl restart novabot_launch.service`: novabot_mapping herbouwt de grid bij boot uit de HUIDIGE
CSV's (removed charge-unicoms niet ingelezen, `chargingPileUnicomGen` draait niet bij boot) → schone
grid → `save_map type:1` → schone map.pgm. Geen file-deletie; risico = ~30-60s node-onderbreking.
Tegelijk de harde bevestiging: stripe weg na rebuild ⇒ kwam van de auto-gen charge-corridor.

## GEVERIFIEERDE methode + reproductie (2026-06-19)

### Restart was een NO-OP
`run_novabot.sh start` (regel 78: `ros2 launch novabot_mapping ... &`) herstart geen al-draaiende
node. Na `systemctl restart`: novabot_mapping **pid 3026 onveranderd**, uptime 73u (geen reboot),
map.pgm md5 ongewijzigd. Grid NIET herbouwd. Een echte rebuild vereist kill+relaunch van de node.

### Debug-log ontdekt: `/root/novabot/data/ros2_log/novabot_mappning_debug_*.log`
De mapping-node logt elke rebuild. Bewijs uit de log:
- Rebuild = lees `map0/1/2_work.csv` (2446/2760/1917 pts) → **dilate** → build map↔map unicom-areas
  → write charging pose. **`map1tocharge`/`map2tocharge` worden NIET ingelezen** (al uitgesloten).
- map1tomap2 unicom-punten: `(-30.69, 6.24) … (-30.65, 4.38)` → ligt op **x≈-30.6, NIET x=-25**.
- Geen "insert charging pile pose"/"dist too large" → **auto-gen-charge-corridor hypothese ONTKRACHT**.

### De "dilate" = polygon-offset van 0.2 m (gemeten, hard)
Per work-polygon: shapely `buffer(d)` die de log-`dilate area` matcht geeft **d ≈ 0.2 m**,
consistent over alle 3 maps (0.199/0.200/0.194; match tot 4 decimalen). De firmware doet dit met
**ClipperLib** polygon-offset. Daarna **`cv::fillPoly`** (OpenCV) → vrij in de grid.

### pgm-methode (volledig)
1. CSV → polygon  2. **0.2 m offset (ClipperLib)**  3. **`cv::fillPoly`** vrij
4. obstacles occupied  5. buiten alles occupied  6. `save_map` schrijft pgm.
**Beide kernlibs (ClipperLib + OpenCV) zijn open source → off-device reproduceerbaar.**

### Reproductie geverifieerd: 96% match
`~/Downloads/david-maps/repro_pgm.py` (shapely buffer 0.2 + PIL fillPoly) reproduceert David's echte
`map.pgm` op **96.04% pixels**. Resterende ~4% = unicom-area-generatie (proprietary
`chargingPileUnicomGen`/`unicomAeraOutsideDeal`) + offset-join (mitre vs shapely). Pixel-exact:
vervang `buffer()` door `pyclipper` (ClipperOffset, JT_MITER).

### x=-25 = het GAT tussen map1 en map2
map1∩map2 overlap = **2.77 m²** (alleen bij de unicom op x≈-30). Op x=-25 dekt map1 4.5 m, map2
10.1 m, **union 14.7 m van 27 m → 12.3 m onbedekt** = occupied band. De zones raken elkaar alléén
bij het unicom-punt (x≈-30); overal anders zit er occupied tussen → dat is de "stripe".

## DEFINITIEVE root cause (2026-06-19) — firmware grid-artefact, NIET in de CSV's

Bovenstaande "gat tussen zones" theorie is **ontkracht**. Bewijs:
- Work-CSV's met even-odd fill + 0.2 m inflate (in de eigen web-editor `csv_editor.html` én via
  shapely/PIL) → **geen streep**. De zones dekken x=-25 gewoon.
- `david_real_map.pgm` header = **`# CREATOR: map_generator.cpp`** — die string staat in de
  **stock** `novabot_mapping` binary (`src/map_generator.cpp`). Dus de globale `map.pgm` wordt door
  de **stock firmware** geschreven, niet door OpenNova-code (`extended_commands.py` doet die header
  alleen ná voor de per-slot pgms).
- **5338 cellen zijn occupied in de echte pgm maar liggen BINNEN de gevulde work-union** → de
  firmware punt de streep erin tijdens grid-opbouw. Zit in **geen enkele CSV**.
- De streep is kaarsrecht verticaal, ~0.6 m, gecentreerd op **pixel-kolom ~253-256** (machtsvan-2
  tegelgrens) → grid-constructie-artefact van `map_generator.cpp`, niet de tuin/CSV-geometrie.

**Waarom werkte het op stock?** Hypothese (niet hard bevestigd, vereist mower-test): David's
originele map werd **live uit scandata** gebouwd (schoon); onder OpenNova kwam de map via
portable-restore terug zonder raster → stock `save_map` **herbouwde** de grid **uit alleen de CSV's**
(ander codepad in dezelfde stock binary) → streep. Nav-stack is volledig stock (geen "OpenNova nav2").

## FIX (2026-06-19) — `handle_fix_lawn_seams` in `extended_commands.py`

Regel: *een cel die occupied is maar strikt binnen een work-polygon ligt en geen mapped obstakel is
→ vrij (254).* Talud-veilig: alleen cellen binnen de **rauwe** (niet-geïnflateerde) work-polygonen
worden geraakt; alles buiten (rand/talud) blijft occupied. Obstakels (`map<N>_<M>_obstacle.csv`)
blijven behouden. Draai **vóór** `regenerate_per_map_files` zodat de per-slot maskers de schone
globale grid erven. Idempotent.

**Lokaal geverifieerd op David's echte `map.pgm`:** 4925 px (12.3 m²) vrijgemaakt op x=-25, en
**0 cellen buiten de polygonen** (talud-veilig bevestigd). Streep weg, obstakels intact.

Open: firmware-build + scp + mower-test (David online) om live te bevestigen + de live-vs-rebuild
hypothese te scheiden.
