# Unicom connector-reconstructie bij cloud-import (Approach C) — Design

**Datum:** 2026-06-05
**Status:** Ontwerp — wacht op review vóór implementatieplan

## Doel

Cloud-geïmporteerde **multi-zone** kaarten weer maaibaar maken door de inter-zone
unicom-connectors (die LFI 0-byte aanlevert) opnieuw te genereren tijdens de
import, zodat de smalle overlap-halzen tussen zones navigeerbaar blijven onder
de costmap-inflatie. Dichtbij het LFI-ontwerp (unicom-kanalen = doorgangen),
minimale wijziging, geen nieuwe pathfinding-engine.

## Achtergrond / bewezen oorzaak (samenvatting onderzoek 2026-06-04/05)

Live op David's maaier (LFIN2231000633) + controleproef op Alain (.100) en
Ramon (.244) vastgesteld:

- David's maaier maait niet: `coverage_planner` plant prima (267 m²), maar
  `nav2 GridBased_AStar` vindt geen pad van dock naar het 1e maaipunt. Beide
  punten zijn vrij; lethal-cellen knijpen de corridor dicht.
- De statische kaart (map.pgm) verbindt start→doel tot **0.6 m** clearance →
  **niet** de kaart-geometrie.
- De **live costmap** disconnect bij `cost ≥ 99` (inscribed). De extra
  lethal-banden vallen **exact in de gaten/halzen tussen de werk-zones**
  (overlay bevestigd).
- David's tuin = **één aaneengesloten gazon** met smalle halzen:
  map0↔map1 overlappen (460 cellen), map1↔map2 overlappen (325 cellen),
  map0↔map2 staan 3.40 m uit elkaar (verbonden via map1). Union = 1 component.
- David's originele LFI-ZIP (`research/maps/David/LFIN2231000633.zip`) bevat de
  inter-zone connectors `map0tomap1_0_unicom.csv` + `map1tomap2_0_unicom.csv`
  **als 0-byte bestanden** (paddata leeg — "by design" van LFI) en
  `charging_pose.orientation = 1.6227 rad (93°)`.
- Huidige staat op maaier/DB: **alleen `map0tocharge_unicom`** (beide inter-zone
  connectors verdwenen) en `charging_pose.orientation = 0`.

**Regressie:** commit `f6191a46` (2026-04-13, *"remove auto-generated unicom
paths"*) verwijderde de code die 0-byte connectors van paddata voorzag (reden:
rechte lijnen waren onrealistisch op het dashboard). Sindsdien:
1. 0-byte connectors blijven path-loos in de DB.
2. `createBundleFromDb` filtert path-loze connectors weg (`filter(u => u.map_area)`).
3. De geïmporteerde bundle heeft geen connectors → smalle halzen knijpen dicht
   onder inflatie → fragmentatie → kan niet maaien.

**Dieper gat (gevonden 2026-06-05 na de eerste release):** de inter-zone
connector-RECORDS worden bij import vaak niet eens aangemaakt. `setup.ts` slaat
in de import-loop een item zonder download-URL over (`if (!csvUrl) … continue`,
regel 342). LFI levert de inter-zone connectors 0-byte **zonder URL**, dus ze
worden geskipt en belanden niet in de DB. David's DB bevestigt dit (alleen
`map0tocharge`). Gevolg: `fillMissingUnicomPaths` heeft geen records om te vullen.
**Extra fix vereist:** no-URL unicom-items als metadata-record aanmaken (spiegelt
de bestaande download-fail-unicom-tak op regel 408-420), zodat de fill ze daarna
kan vullen.

Controle: `.244` werkt omdat z'n bundle van een **snapshot van de live maaier**
kwam (`createBackup` → `read_map_files`), waar de firmware de connector-paden al
had ingevuld. Het snapshot-pad blijft dus ongemoeid; alleen het
**cloud-import → CSV → bundle** pad is kapot.

## Approach C (gekozen)

Herstel de connector-paddata-generatie die `f6191a46` weghaalde,
**geclipt op de werk-union** zodat een gegenereerd pad nooit door
obstakels/buiten-gebied loopt (veilig voor het algemene geval; voor David
triviaal want de verbonden zones overlappen).

De synthetische connectors **mogen gewoon zichtbaar zijn op het dashboard**
(gebruiker akkoord — geen suppressie nodig). Daarmee vervalt de `generated`-vlag,
de DB-kolom en elke dashboard-wijziging; dit houdt het dicht bij de oude
pre-f6191a46 situatie.

Plus een losse fix: behoud de `charging_pose.orientation` uit de import i.p.v.
`?? 0` in `createBundleFromDb`.

## Componenten & bestanden

| Component | Bestand | Wijziging |
|-----------|---------|-----------|
| Connector-generatie (shared helper) | `server/src/maps/unicomConnector.ts` (NIEUW) | `generateUnicomPath(fromPts, toPts, workUnion, stepM)` → geclipte puntenlijst |
| Import-hook | `server/src/routes/setup.ts` | Na CSV-import: voor elke 0-byte inter-zone unicom de helper aanroepen, `map_area` invullen |
| Bundle-orientatie | `server/src/services/portableBackup.ts` (`createBundleFromDb`) | Orientatie uit opgeslagen import-waarde i.p.v. `?? 0` |
| Import-orientatie | `server/src/routes/setup.ts` | Bij import `setPolygonChargingOrientation(sn, orient)` zetten uit cloud chargingPose |
| Verificatie-tool | reeds aanwezig (flood-fill snapshot script) | Acceptatie: live global costmap verbindt start→doel bij `cost ≥ 99` |

## Gedetailleerd ontwerp

### 1. `generateUnicomPath(fromPts, toPts, workPolys, stepM = 0.25)`
- Bepaal een representatief doelpunt in `toPts` (centroid) — zoals de oude code.
- Vind het dichtstbijzijnde punt op `fromPts` t.o.v. dat doel.
- Interpoleer een rechte lijn doel→dichtstbijzijnd punt met stap `stepM`.
- **Clip:** behoud alleen punten die in de **werk-union** liggen
  (`pointInAnyPolygon(p, workPolys)`). Dit voorkomt dat de corridor door
  obstakels/buiten loopt.
- Retourneer de geclipte puntenlijst. Leeg → geen connector (log warning).
- **Randgeval (niet-overlappende verbonden zones):** als clippen een gat in het
  pad achterlaat (lijn verlaat en herbetreedt de union), log een waarschuwing en
  emit de in-union-segmenten. Echte pathfinding (Approach A) is een latere
  uitbreiding indien nodig; voor de huidige LFI-kaarten (overlappende halzen)
  niet vereist.

### 2. Import-hook (`setup.ts`, op de plek waar `f6191a46` de code verwijderde)
- Na succesvolle CSV-import: haal work-polygonen uit DB.
- Voor elke unicom-item met lege/0-byte CSV én naam `map\d+tomap\d+_\d+_unicom`:
  - parse from/to zone-index;
  - `generateUnicomPath(...)`;
  - `updateAreaAndBoundsById(map_id, JSON.stringify(points), '{}')`.
- `map\d+tocharge_unicom` met data blijft ongemoeid.

### 3. Orientatie-preservatie
- In `setup.ts` import: parse `chargingPose.orientation` en bewaar via
  `mapRepo.setPolygonChargingOrientation(sn, orient)` (alleen als eindig & ≠ 0,
  anders niet overschrijven).
- `createBundleFromDb` blijft `getPolygonChargingOrientation(sn) ?? 0` gebruiken —
  die geeft nu de juiste waarde terug. Geen verdere wijziging nodig.

### 4. Dashboard
- Geen wijziging. De gegenereerde connectors mogen zichtbaar zijn (gebruiker
  akkoord). De render tekent ze zoals elke andere unicom.

## Datastroom (na fix, cloud-import pad)
```
LFI queryEquipmentMap → CSV-import (work/obstacle/unicom, connectors 0-byte)
  → setup.ts: generateUnicomPath() vult inter-zone connectors (geclipt) + generated=1
  → setPolygonChargingOrientation(orient)
  → createBundleFromDb: unicom met map_area passeert filter; orientatie behouden
  → bundle bevat connectors → apply-verbatim → maaier: halzen navigeerbaar → maait
```

## Edge cases
- Connector waarvan from/to work-zone ontbreekt → skip + log.
- Clippen levert leeg pad → geen connector (log; map blijft als voorheen).
- Single-zone kaart (Alain) → geen inter-zone connectors → ongewijzigd gedrag.
- Snapshot-pad (`createBackup`/`.244`) → connectors hebben al echte paddata →
  niet gegenereerd → ongemoeid.
- Bestaande kapotte imports (David nu) → fix werkt bij **re-import** (cloud-apply
  opnieuw draaien haalt de 0-byte connector-metadata van LFI + genereert paden).

## Testen / verificatie
- **Unit:** `generateUnicomPath` — overlappende zones → pad in union;
  niet-overlappende met gat → geclipt/gewaarschuwd; degenererende input.
- **Integratie:** cloud-import van een multi-zone fixture → DB-unicom heeft
  `map_area`; bundle bevat de connector-CSVs.
- **Regressie:** bestaande `occupancyGrid`/bundle bit-identiek-tests blijven groen.
- **Acceptatie (live, David):** re-import → push → live global costmap-snapshot
  → flood-fill start→doel bij `cost ≥ 99` = CONNECTED (was DISCONNECTED).

## Out of scope
- Firmware/maaier-wijzigingen (server-only fix; maaier krijgt fix via re-import).
- Volwaardige pathfinding (Approach A) — alleen als een toekomstige kaart
  verbonden niet-overlappende zones met obstakels in de gap blijkt te hebben.
- Het snapshot/restore-pad (bewezen correct, blijft ongemoeid).
