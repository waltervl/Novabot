# Unicom `csv_file` = alleen het pad-stuk BUITEN de work-areas (firmware-bewezen)

**Status:** 100% bevestigd uit de firmware-binary (Ghidra-decompilatie). Geen hypothese.
**Datum:** 2026-06-17
**Binary:** `research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping`
md5 `f2c8c9db5838f32b6c080a83c50fc281` — ARM aarch64, **not stripped**, BuildID `7c7eae8d659fc72aec101898f512b6255dd68c84`, build-datum 19 mei 2023.
**Byte-identiek** aan de live binary op David's mower (LFIN2231000633, `/root/novabot/install/novabot_mapping/lib/novabot_mapping/novabot_mapping`) — md5 ge-checkt, exact gelijk. Ook identiek in `mower_firmware_6.0.3/`. Dit is de **basis mapping-node**, niet onze custom-code; dus identiek gedrag op custom-24/38/38+.

---

## Het symptoom

Een map↔map kanaal (unicom) gereden met de OpenNova-app:

| Mower | `x3_csv_file/map0tomap1_0_unicom.csv` | `csv_file/map0tomap1_0_unicom.csv` |
|-------|---------------------------------------|------------------------------------|
| Ramon (.244) | 16 punten | **3 punten** (zichtbaar in app + DB) |
| David (.196) | 10 punten | **0 bytes** (niet in DB, onzichtbaar) |

Zelfde app, zelfde firmware-binary. De server leest **alleen `csv_file`** (zie onder), dus David's kanaal kwam nooit in de DB → onzichtbaar in de app én de per-map pgm-corridor werd niet uitgesneden → maaier reed direct terug naar de dock i.p.v. map1 te maaien.

---

## De oorzaak (uit `saveScanData`, `novabot_mapping.cpp`)

Bij het opslaan van een map↔map-unicom schrijft de firmware **twee** bestanden met **verschillende** inhoud:

```c
// saveScanData()  — scan type 2, twee-map unicom-tak
// 1) x3_csv_file/<name>_unicom.csv  = de VOLLEDIGE gelopen route (alle opgenomen punten)
saveData(this /*x3 dir = this+0x98*/, this+0x368 /*recordedPath, alle punten*/, path);

// 2) csv_file/<name>_unicom.csv = alleen punten BUITEN elke work-area:
filtered = [];
for (point in recordedPath /* this+0x370..0x378 */) {
    inside = false;
    for (area in workAreas /* this+0x2c0..0x2c8 */)
        if (cv::pointPolygonTest(area, point, /*measureDist=*/false) >= 0)  // binnen of op rand
            inside = true;
    if (!inside) filtered.push(point);          // ALLEEN punten buiten ÁLLE work-areas
}
saveData(this /*csv dir = this+0xd8*/, filtered /*local_910*/, path);
```

`cv::pointPolygonTest(area, point, false)` geeft `+1` (binnen), `0` (rand), `-1` (buiten). De
firmware test `-1.0 < result` → punt telt als "binnen" bij `0` of `+1`. Een punt wordt **alleen
bewaard als het buiten ELKE work-area valt** (resultaat `-1` voor alle areas).

> Guard: als de work-area-lijst leeg is (`local_950 == lStack_948`) worden alle punten bewaard.
> Dat is hier niet het geval — David heeft 3 work-maps.

### Functie-adressen (voor re-analyse)
- `saveScanData` @ `0x15f278`
- `eraseRecordingPoints` @ `0x144d30` (verwijdert trailing punten <0.3 m van de eind-pose; src 3172–3182) — **niet** de reductie
- `unicomAeraOutsideDeal` @ `0x153488` (cleanup: verwijdert losse `*_unicom.csv` die helemaal buiten het nieuwe gebied vallen, log "Unicom out size map!!! rm %s !"; src 3291–3338) — **niet** de reductie
- `ifPointInArea` @ `0x1480c8`, `recordingCallback` @ `0x1487d0`
- Bron op de mower: `/root/novabot/src/novabot_mapping/novabot_mapping/src/novabot_mapping.cpp`

---

## Waarom David leeg en Ramon niet — puur geometrie

`csv_file` bevat per ontwerp **alleen het stukje van de route dat in de ongekarteerde ruimte
TUSSEN de zones ligt** (de echte "brug" door de gap).

- **David**: zijn route liep recht van map0 ín map1. De firmware logde dit zelf:
  `push back start point:(-4.62,1.17)` → `push back map 0` → ... → `push back map 1` → ...
  Geen enkel punt viel buiten een zone (de zones grenzen aan elkaar / overlappen waar hij reed).
  → filter gooit alle 10 punten weg → **csv leeg**. x3 houdt alle 10.
- **Ramon**: zijn route kruiste een echte gap (map0 stopt, map1 begint verderop). 3 punten
  vielen buiten beide zones → die overleefden → **csv = 3 punten**.

Zone-extents (work-CSV, lokale meters), ter illustratie:

| | map0 x-bereik | map1 x-bereik |
|---|---|---|
| Ramon | −0.92 … **4.06** | **3.81** … 9.44 (gap/overlap rond 3.8–4.1, daar zitten z'n 3 brug-punten) |
| David | −27.5 … 1.19 | −36.7 … −5.27 (route −4.62…−6.09 op y≈1.2 zit binnen de zones) |

---

## Hoe de server de map inleest (waarom x3 nooit meetelt)

- De upload-zip die de mower maakt bevat **alleen `csv_file/`**, geen `x3_csv_file/`.
  (Geverifieerd op Ramon's `LFIN2230700238.zip`: 6 files, allemaal `csv_file/...`.)
- `parseMapZip()` in `server/src/mqtt/mapConverter.ts` (regels ~401–447) leest uitsluitend
  `csv_file/*.csv` en parseert elke regel `x,y` → `map_area` JSON. Lege csv → `localPoints.length == 0`
  → `continue` → **geen DB-row**.

Gevolg: de "brug-fragment"-csv van de firmware is de enige bron die de server ziet. Bij rakende
zones is die leeg → kanaal verdwijnt volledig uit de OpenNova-flow.

---

## Bevestiging via "het maaide na de fix"

David's mower reed map1 **niet** zolang `csv_file` leeg was (en geen DB-row). Nadat we
`x3 → csv_file` kopieerden **en** de DB-row `map0tomap1_0_unicom` (10 punten) invoegden, maaide hij
map1 wél. Dat bevestigt dat (a) de volledige route in x3 de juiste bron is, en (b) de unicom-csv de
per-map pgm-corridor voedt (coverage plant op de pgm — zie [[per-map-pgm-coverage-bug]]).

De 0-byte map↔map unicoms in de LFI-cloud passen hier ook in: bij aaneengesloten zones is dat de
**verwachte** firmware-uitvoer, geen download-bug. Het volledige corridor-pad leefde alleen in de
originele live-SLAM pgm (die wij niet hebben → wij regenereren uit CSVs → corridor ontbreekt).

---

## Implicatie / fix-richting

`csv_file` is voor map↔map **onbetrouwbaar** (leeg zodra zones aaneengesloten zijn). De volledige
route staat **altijd** in `x3_csv_file`. Durabele fix: de server moet voor unicoms de `x3`-route
gebruiken i.p.v. de `csv_file`-fragment. Omdat de upload-zip x3 niet meestuurt, betekent dat ofwel:

1. server leest `x3_csv_file/<unicom>` van de mower (bestaand `read_map_files` extended command) wanneer
   `csv_file/<unicom>` leeg is, of
2. de mower neemt `x3_csv_file/` mee in de upload-zip en `parseMapZip` valt terug op x3 bij lege csv.

Per-device handmatige workaround (toegepast bij David, omkeerbaar): `cp x3_csv_file/<u> csv_file/<u>`
op de mower + DB-row invoegen met de x3-punten.

---

## Reproduceren

```bash
# md5 check tegen de live mower-binary
md5 -r research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping
# Ghidra headless (project blijft staan voor hergebruik):
/Applications/Ghidra.app/Contents/Resources/ghidra/support/analyzeHeadless /tmp/ghidra_proj nmap \
  -import research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping \
  -scriptPath research/ghidra-scripts -postScript DecompUnicom.java
# Daarna per functie: -process novabot_mapping -noanalysis -postScript DecompByName.java
```
Scripts: `research/ghidra-scripts/DecompUnicom.java`, `DecompByName.java`, `DecompOutside.java`.
