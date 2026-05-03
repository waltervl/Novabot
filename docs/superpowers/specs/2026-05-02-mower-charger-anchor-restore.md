# Mower Charger-Anchor Restore (Path B)

**Date:** 2026-05-02
**Mower:** LFIN1231000211 (Alain, .100)
**Status:** Spec approved, ready to execute
**Brainstorm context:** see conversation 2026-05-02 evening — pos.json corrupt + dashboard recalibrate-bug overschreef charger pose

---

## Probleem

Sinds 1 mei 15:45 escapen mower-coverage tasks de polygon. Polygon zelf is intact (md5 matched DB + ZIP + mower disk). Charger niet fysiek bewogen. Maar:

- `pos.json` overschreven (mtime 1 mei 15:45) → map frame anchor verschoven
- `charging_station.yaml` overschreven naar (0, 0, 0) door dashboard recalibrate-bug terwijl `localization_state: Not initialized` (placeholder)
- DB `chargingPose` ook gedreft (geen historische match met polygon's anchor)

Polygon's TRUE anchor (uit `map0tocharge_unicom.csv` first point + originele yaml van 27 apr 14:03):

```
charging_pose: (-1.21, 0.48, 1.50 rad)
```

Mower's huidige RTK GPS op dock: `(52.14088864656, 6.23103579689)` (RTK FIX, 26 sat, HDOP 0.6 — high confidence).

DB chargerGps van 27 apr: `(52.14100957665, 6.231316030025)` — 24m verschil van huidige GPS = charger UM980 base RTK reference is verschoven sinds 27 apr (re-survey).

## Doel

Restore alle anchor-state op mower + DB zodat:
- Mower's huidige GPS-reading op dock → map_pos `(-1.21, 0.48)` in map frame
- Dat anchor matched de polygon (ongewijzigd)
- Mower navigeert binnen polygon zonder escape

## Aanpak (Path B — accept GPS shift, restore polygon-anchor consistency)

Bereken nieuwe `pos.json` waardes zodanig dat huidige mower GPS de juiste map_pos voor charger oplevert:

```
mower current UTM at charger = (310524.588, 5780324.457)
wanted charger map_pos        = (-1.21, 0.48)
→ utm_origin                  = (310525.797709, 5780323.976627)
→ wgs84_origin                = (52.14088475097, 6.2310537248)
```

Yaml/JSON op mower krijgen de polygon-anchor waarden `(-1.21, 0.48, 1.50)`.
DB chargingPose zelfde. DB chargerGps update naar huidige RTK reading (consistent met nieuwe pos.json).

## Files te wijzigen

### Mower (.100, SSH)
| File | Nieuw content |
|------|---------------|
| `/userdata/pos.json` | utm_origin (310525.797709, 5780323.976627), wgs84 (52.14088475097, 6.2310537248), zone 32 |
| `/userdata/lfi/charging_station_file/charging_station.yaml` | `charging_pose: [-1.21, 0.48, 1.50]` |
| `/userdata/lfi/maps/home0/csv_file/map_info.json` | charging_pose (-1.21, 0.48, 1.50), map_size 212.16 (preserve) |
| `/userdata/lfi/maps/home0/x3_csv_file/map_info.json` | idem |
| `/root/novabot/data/maps/home0/csv_file/map_info.json` | idem (mirror) |
| `/root/novabot/data/maps/home0/x3_csv_file/map_info.json` | idem (mirror) |

### Server DB (.247:8080 NAS, SQLite via docker exec)
| Tabel/veld | Nieuw waarde |
|------------|--------------|
| `equipment.charger_lat` (LFIN1231000211) | 52.14088864656 |
| `equipment.charger_lng` | 6.23103579689 |
| `map_calibration` (or wherever chargingPose lives) | x=-1.21, y=0.48, orientation=1.50 |

## Backup strategie

Voor elke file:
```
cp $f $f.bak.$(date +%s)
```

Backups blijven naast originelen voor easy revert. Als mower na reboot niet werkt: `mv $f.bak.<ts> $f` + reboot.

DB backup: `sqlite3 .dump > /tmp/db-backup-pre-restore.sql` op NAS vóór update.

## Polygon — NIET aanraken

`map0_work.csv` en alle obstacle/unicom CSVs blijven byte-voor-byte ongewijzigd.

## ZIP op mower (`/userdata/lfi/maps/home0/LFIN1231000211.zip`) — NIET aanraken

Mower navigeert niet uit ZIP. Per CLAUDE.md memory: "Maaier downloadt NOOIT kaarten." ZIP is voor server-side ingestion. Wordt vanzelf vervangen bij volgende mapping/upload.

## Validatie post-restore

1. Mower reboot
2. Wacht ~60s tot localization_state ≠ "Not initialized"
3. Check via `/api/dashboard/devices/LFIN1231000211`:
   - `localization_state`: niet "Not initialized"
   - `map_position_x` ≈ -1.21 (±0.05)
   - `map_position_y` ≈ 0.48 (±0.05)
   - `map_position_orientation` ≈ 1.50 (±0.1)
   - `battery_state`: Charging
4. Drive-back test: korte joystick-rit van dock + return → localization mag drift maar moet stabiel zijn
5. Coverage test: start_navigation → mower blijft binnen polygon

## Rollback

Single command per file:
```
mv /userdata/pos.json.bak.<ts> /userdata/pos.json
# repeat for other files
reboot
```

## Risico

| Risico | Mitigatie |
|--------|-----------|
| pos.json wijziging triggert localization re-init issues | Reboot daarna; backups beschikbaar |
| DB schema mismatch (kolom-namen anders dan ingeschat) | Inspect SQLite schema vóór UPDATE; transactional UPDATE |
| Mower's GPS leest morgen weer 24m off (charger UM980 re-survey opnieuw) | Buiten scope — separate issue. Charger UM980 should be set to FIXED_BASE met vaste coords ipv AUTO_BASE (zie open-charger fw work) |
| Localization na reboot wijst (-1.21, 0.48) maar polygon-navigatie blijft escapen | Andere root cause aanwezig — maar Path B ruimt 1 grote variabele op |

## Out-of-scope

- Charger UM980 base RTK survey stability (separate bd issue — `feat(charger)` van vandaag dekt deze in v0.1.1+)
- Server bug `recalibrate-charging-pose` accepteert (0,0,0) → al gefixed in release v2026.0502.2015
- Polygon herontwerp / re-mapping
- Schedule + rainMonitor bugs (separate cleanup)

## Bd issues op te volgen

| Issue | Wat |
|-------|-----|
| File new bd | "DB chargingPose drift detection — alert when DB ≠ mower yaml" |
| File new bd | "pos.json backup on every save_recharge_pos write" |
| File new bd | "Charger UM980 FIXED_BASE config in OpenNova firmware" (links to existing Novabot-zzg follow-up) |
