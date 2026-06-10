# Map & Obstacle Editing — Design

**Datum:** 2026-06-10
**Status:** Goedgekeurd (brainstorm-sessie Ramon)

## Probleem

Op meerdere plekken maait de maaier te ver van objecten af, waardoor stroken gras blijven staan. De gescande work-boundaries en obstacle-randen zijn daar te ruim. Er is geen manier om die lijnen achteraf bij te stellen — de officiële Novabot app kan dit ook niet (geverifieerd via blutter-decompilatie en gap-analyse: alleen rename/delete/opnieuw scannen; geen polygon-edit commando's in BLE/MQTT/cloud API). Dit wordt dus een pure OpenNova-feature via onze eigen server→maaier flow.

## Doel

Work-boundaries en obstacle-randen plaatselijk kunnen aanpassen (vertex-editing + lokaal duwen/trekken), nieuwe obstacles kunnen tekenen en bestaande obstacles kunnen verwijderen — zowel via het dashboard als via de OpenNova app — met een expliciete "Toepassen op maaier"-stap en undo.

## Scope

**In scope (v1):**
- Bestaande work- en obstacle-polygonen bewerken: vertex slepen/toevoegen/verwijderen + duw/trek-brush
- Nieuw obstacle tekenen (zonder rondrijden met de maaier)
- Bestaand obstacle verwijderen
- Dashboard-editor (Map Viewer) én app-editor (`MapEditScreen`)
- Expliciete Apply naar de maaier, versie-snapshot + revert

**Buiten scope (v1):**
- Unicom-paden bewerken
- Dock verplaatsen
- Globale `map.pgm`-regeneratie (grote uitbreidingen buiten ooit-gescand gebied)
- Nieuwe work-zones tekenen

## Gekozen aanpak

Server-centrisch (aanpak A): één edit-service op de server met REST endpoints; dashboard en app zijn dunne clients die alleen interactie doen. Alle validatie, versioning en CSV-generatie op één plek. Apply hergebruikt het bewezen `write_map_files` + `regenerate_per_map_files` pad van de portable-restore flow — geen nieuwe firmware-commando's nodig.

Verworpen alternatieven:
- **Client-heavy:** dubbele validatielogica in adminPage (vanilla JS string-templates) én React Native; buggy client kan ongeldige CSVs naar de maaier sturen.
- **Dashboard-eerst-fasering:** beide clients in één project gewenst.

## Architectuur & dataflow

### Nieuwe server-service: `server/src/services/mapEdit.ts`

Geometrie ophalen/vereenvoudigen, drafts beheren, valideren, apply'en.

### Datamodel (SQLite)

- **`map_edit_drafts`**: `(mower_sn, canonical_name, draft_area JSON, base_version, updated_at)`. Drafts staan los van `maps.map_area`; bestaande map-sync en `queryEquipmentMap` blijven het origineel zien tot Apply. Nieuw obstacle = draft met nieuw canonical slot; delete = delete-markering in de draft.
- **`map_versions`**: `(id, mower_sn, snapshot JSON van alle polygonen, created_at, label)`. Bij elke Apply wordt de huidige staat eerst gesnapshot. Lineaire historie, geen branches.

### REST endpoints (onder `/api/dashboard/maps/:sn/`)

| Endpoint | Doel |
|---|---|
| `GET geometry` | Alle polygonen (work/obstacle/unicom) + drafts; vertices vereenvoudigd (Douglas-Peucker ~5 cm) voor de editor; unicoms read-only voor context |
| `PUT draft` | Draft opslaan/bijwerken per canonical_name; ook nieuw obstacle (volgend vrij slot, bv. `map0_2_obstacle`) en delete-markering |
| `DELETE draft` | Draft(s) weggooien → terug naar origineel |
| `POST apply` | Valideren → versie-snapshot → `maps` bijwerken → CSVs genereren → push naar maaier → drafts opruimen |
| `POST revert` | Laatste versie-snapshot terugzetten via hetzelfde apply-pad |

### Apply-volgorde (`POST apply`)

1. Pre-checks: maaier online, work-status idle/docked, geen andere apply bezig (lock per SN)
2. Validatie van álle drafts samen (zie Validatieregels)
3. Versie-snapshot huidige `maps`-staat naar `map_versions`
4. `maps.map_area` bijwerken (+ inserts/deletes voor nieuwe/verwijderde obstacles) in één transactie
5. CSVs genereren uit de DB (bestaand `generateCsvFromDb`-pad) en pushen via `write_map_files`. Dat command wist + herschrijft de complete CSV-set → altijd álle maps van de maaier sturen, niet alleen de bewerkte (incl. ongewijzigde unicoms). `charging_station.yaml` en `pos.json` blijven ongemoeid (geen anker-impact: alles in hetzelfde lokale frame).
6. `regenerate_per_map_files` → wachten op respond; daarna md5-check dat per-slot pgm's onderling verschillen (bekende masking-bug-check, zie per-map-pgm-coverage-bug)
7. Drafts opruimen; succes terugmelden met samenvatting (welke maps, m² verschil)

### Validatieregels (server-side, bron van waarheid)

- Polygon gesloten, geen self-intersection
- Obstacle volledig binnen z'n work-area
- Minimum oppervlak (obstacle ≥ 0,5 m²)
- Verschuiving t.o.v. origineel >1 m: waarschuwing in de bevestigingsdialoog (géén harde blokkade) — de globale nav-`map.pgm` wordt niet geregenereerd, grote uitbreidingen buiten ooit-gescand gebied zijn onbewezen terrein

## Editor-UI

### Gedeelde interactielogica

Pure TS-functies, geen UI: vertex-hit-testing, brush-verplaatsing (punten binnen radius langs hun normaal verschuiven met cosinus-falloff), punt invoegen/verwijderen, client-side pre-checks (zelfde regels als server, voor directe feedback). Locaties: `server/src/shared/mapEditGeometry.ts`, gespiegeld in `app/src/utils/mapEditGeometry.ts` (server-versie is bron van waarheid; klein genoeg om identiek te houden).

### Dashboard (Map Viewer, `adminPage.ts`)

- "Bewerken"-knop in de bestaande Map Viewer tab → edit-modus op hetzelfde canvas (zoom/pan blijft werken)
- Toolbar: **Selecteren/vertex** (slepen; dubbelklik = punt toevoegen; alt-klik = verwijderen), **Duwen/trekken** (brush, radius 0,3–2 m via slider, cirkel-cursor), **Nieuw obstacle** (klikken plaatst punten, dubbelklik sluit), **Obstacle verwijderen** (selecteer + delete)
- Origineel blijft als gestippelde ghost-lijn zichtbaar (zelfde stijl als calibration-ghost)
- Onderbalk: *Draft opslaan* (PUT draft, auto met debounce), *Reset* (DELETE draft), *Toepassen op maaier* (POST apply, bevestigingsdialoog met validatie-resultaten), *Terugdraaien* (POST revert, alleen zichtbaar als er een vorige versie is)

### OpenNova app

- Nieuw scherm `app/src/screens/MapEditScreen.tsx`, bereikbaar vanaf de kaartweergave ("Kaart bewerken")
- Zelfde SVG-rendering als `LiveMapView` + touch: pinch-zoom/pan; tik op lijn = vertex-handles; sleep handle = verplaatsen; brush-modus met radius-slider en één-vinger slepen over de rand
- Handles ruim (44 pt); geen magnifier-loep in v1 (zoom volstaat)
- Zelfde onderbalk-acties; praat tegen exact dezelfde endpoints

### Weergave

Alle work-polygonen + obstacles van de geselecteerde maaier; unicoms grijs/read-only; dock als marker (niet verplaatsbaar).

## Foutafhandeling

- **Maaier valt weg tijdens stap 5/6:** DB is bijgewerkt, maaier niet → status "pending sync"; Apply-knop wordt "Opnieuw synchroniseren". Geen automatische retry-loop.
- **Validatiefout:** niets gebeurt; fouten per polygon teruggegeven en visueel gemarkeerd in de editor (rood gehighlight + melding).
- **Revert** gebruikt hetzelfde pad → een mislukte apply is altijd herstelbaar zodra de maaier weer online is.
- Apply geweigerd terwijl de maaier maait/dockt, met duidelijke foutmelding.

## Testen

- **Unit (vitest, in-memory DB):** geometrie-functies (brush, RDP-vereenvoudiging, validatie — incl. bijna-self-intersect en obstacle op de rand), draft CRUD, versie-snapshot/revert, apply-payload-opbouw (exacte `write_map_files` shape)
- **App:** bestaande snapshot-test-aanpak voor `MapEditScreen`
- **Acceptatie live (Ramon):** op LFIN1231000211 — één obstacle-rand ~30 cm naar binnen trekken op een probleemplek, Apply, maaien in die zone en checken dat de maaier dichter langs het object gaat; daarna revert testen. Pas daarna grotere edits.

## Open punten / risico's

- Nav-gedrag bij edits die vrij gebied toevoegen waar de globale `map.pgm` occupied/unknown is (obstacle verkleinen, boundary uitbreiden): coverage volgt de per-slot pgm en is gedekt; nav2 global costmap is onbewezen. Eerste live-test bewust klein houden (~30 cm).
- Brush-falloff parameters (radius-bereik, falloff-curve) afstemmen tijdens implementatie op echte CSV-puntdichtheid.
