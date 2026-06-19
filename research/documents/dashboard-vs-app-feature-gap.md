# OpenNova app ↔ Dashboard — feature-gap & gedragsanalyse

Datum: 2026-06-11. Vergelijking van `app/src` (React Native) vs `dashboard/src` (React/Vite/Leaflet).
Doel: (A) wat zit wél in de app maar niet in het dashboard, (B) doen de gedeelde functies hetzelfde.

> Sommige regels zijn met "⚠️ verifiëren" gemarkeerd — die volgen uit de geautomatiseerde
> codebase-scan en zijn nog niet 1-op-1 in de code bevestigd.

---

## A. In de app, NIET (of beperkt) in het dashboard

| Functie | App | Dashboard | Prioriteit |
|---|---|---|---|
| **Handmatige besturing (joystick)** | Volledig: rijden + blade aan/uit, snelheid 1-5, BLE | Ontbreekt | Hoog |
| **Nieuwe kaart maken (mapping-flow)** | Geleid: autonoom (`start_assistant_build_map`) én handmatig (BLE `start_scan_map`/`add_scan_map` + charger-pos opslaan + `quit_mapping_mode`) | Alleen "Draw" (polygon klikken) + losse "Mapping"-knop (`start_assistant_build_map`); geen geleide stap-voor-stap flow met obstakels/charger-save | Hoog |
| **Regen-check vóór start/hervatten** | Haalt forecast op, vraagt "toch starten?" + `rain-ignore-session` | Manueel starten doet géén regen-check (schema's hebben wel regen-instellingen) | Midden |
| **BLE provisioning / LoRa pairing** | Volledig: nieuw device, LoRa-adres toekennen, conflictdetectie, mower↔charger koppelen | `BleScanner` registreert alleen MAC; geen LoRa-provisioning/pairing | Hoog (onboarding) |
| **Re-anchor wizard** | Stap-voor-stap frame-herankering na restore (`reanchor` + status-poll) | Wel charger-calibrate / dock-and-save, geen geleide re-anchor wizard | Midden |
| **Map import (bestand/cloud)** | Import uit .zip + cloud-maps | Alleen **export** (zip); geen import-UI ⚠️ verifiëren | Midden |
| **Spot-mowing (teken gebied → maai)** | "Maai specifiek gebied" (`start_run` SPECIFIED_AREA op getekende polygon) | Pattern-mode lijkt erop maar geen los "teken-en-maai" ⚠️ verifiëren | Laag |
| **Multi-map maaien** | ✅ Native: één `start_navigation` met bitmask-`area` (map0=1, map1=10, map2=100; som = alle) — firmware maait alle zones in één taak, geen dock ertussen | ✅ Idem (zelfde bitmask-command); oude `MowQueue`/server-queue verwijderd | Klaar |
| **Mower-instellingen** | Veel: koplamp, geluid, tijdzone, obstakel-gevoeligheid, joystick-snelheid/handling, regen-thresholds, soft-restart | Deels in SettingsPanel (licht, perceptie, PIN, blade-hoogte); rest ontbreekt | Midden |
| **Account / login / taal** | Login, account, logout | Lokaal/geen account (per ontwerp decentraal) | n.v.t. |
| **Return-reason modal** | Vraagt reden van terugkeer (accu/regen/klaar) | Niet | Laag |
| **Snapshot → galerij** | Bewaart in galerij | Download als bestand | Laag |

## B. In het dashboard, NIET in de app (power/admin)

| Functie | Dashboard |
|---|---|
| **Tile-laag keuze** | Esri / PDOK (NL) / Google / USGS / OSM, auto per regio |
| **Virtuele muren** | Twee-punts no-go rechthoeken |
| **Server-diagnose** | mDNS-status, server-uptime, log-tail, LoRa-drift, netwerk-health (drawer) |
| **Charge-threshold / max-speed sliders** | `set_charge_threshold`, `set_max_speed` |
| **Perceptie/semantic mode, PIN-raw** | Admin extended commands |
| **OTA versie-beheer** | Versies bewerken/verwijderen + per-device trigger + downgrade-waarschuwing |
| **Reboot-knop met bevestiging** | `set_robot_reboot` |

> Map-editor (vertex/brush/verf-gum/move/copy-paste/undo-redo/expand-shrink) zit nu in **beide** —
> app `MapEditScreen` + dashboard `MowerMap`, op dezelfde server-draft/apply-endpoints met de gedeelde
> `editGeometry`/`coverPathProgress` utils.

---

## C. Gedeelde functies — werken ze hetzelfde?

| Functie | Zelfde gedrag? | Notitie |
|---|---|---|
| **Activity-statemachine** (idle/charging/mowing/paused/returning/edge/error) | ✅ Ja | Dashboard `deriveMowerActivity` spiegelt app `deriveMower` 1-op-1 |
| **Knop-zichtbaarheid per status** | ✅ Ja | Start verborgen tijdens maaien, Pause/Stop/Go-Home, Resume bij paused, etc. |
| **Return-to-home (stop vs pauze + terug)** | ✅ Ja (net gefixt) | 3-keuze popup, zelfde commando's + `go_pile`→500ms→`go_to_charge {200,200}` |
| **Pause/Resume/Stop** | ✅ Ja | `pause/resume/stop_navigation` + `cmd_num`; long-pause >15min bevestiging in beide |
| **Edge-cut** | ✅ Ja | `start_edge_cut` (mapName, bladeHeight mm, departFromDock) + `stop_boundary_follow` |
| **Coverage-pad + voortgang** | ✅ Ja | Gedeelde `coverPathProgress` util (finished/actief/resterend), zelfde sensors |
| **Maaihoogte** | ⚠️ Verifiëren | App: 2-9 cm (wire = cm−2). Dashboard: 20-80 mm-stappen. Beide → `set_para_info`/`start_navigation`. Controleren dat de wire-encoding identiek is (cutterhigh = cm−2). |
| **Maairichting** | ✅ Waarschijnlijk | Beide `set_para_info { path_direction }` bij slider-wijziging, 15°-stappen |
| **Start area-enum** | ⚠️ Verifiëren | Dashboard mapt area 0→1, 1→10, 2+→200. Controleren of de app exact dezelfde enum stuurt |
| **Start fallback** | ✅ Ja | Beide vallen terug op `start_run` als `start_navigation` faalt |

---

## D. Aanbevolen prioriteit om het dashboard "app-compleet" te maken

1. **Mapping-flow** (nieuwe kaart maken, geleid) — grootste functionele gat; zonder dit kun je op het dashboard geen kaart vanaf nul maken.
2. **Joystick / handmatige besturing** — nodig voor handmatig mappen + verplaatsen.
3. **BLE provisioning / LoRa pairing** — onboarding van nieuwe devices.
4. **Regen-check bij handmatig starten** — gedragspariteit.
5. **Maaihoogte wire-encoding + area-enum verifiëren** — kleine maar kritieke correctheidschecks.
6. **Mower-instellingen uitbreiden** (koplamp/geluid/tijdzone/obstakel-gevoeligheid).
7. Re-anchor wizard, multi-map wachtrij, map-import — daarna.
