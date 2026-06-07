# Per-map occupancy-grid duplication → single-zone mow covers the whole property

> **Status:** ROOT CAUSE FOUND + FIXED. Live-confirmed on LFIN2230700238, 2026-06-07.
> Introduced in `v6.0.2-custom-30`, fixed in `v6.0.2-custom-36`.

## Symptom

Starting a mow on **one** zone (e.g. the front lawn / Voortuin = `map1`) made the
mower cover the **whole property** (both lawns) and drive across the other zone
straight into the bushes. It never routed via the inter-zone unicom toward the
selected zone — it just started covering where it stood.

This was *not* orientation, *not* the re-anchor/dock command, *not* the unicom,
and *not* the app's `area` value. All of those were verified correct:

- Docked localization correct: `map_position ≈ (0.02, 0.05)` = `charging_pose (0, 0.06)`, yaw offset `-87°` = dock heading `-1.518 rad`.
- App sent `start_navigation {area: 10}` for `map1` — and the official Novabot app (blutter `lawn_page/logic.dart`) maps `map0→1, map1→10, map2→200`, so `area:10` is exactly right for the Voortuin.

## Root cause

The mower regenerates its per-map occupancy grids via the OpenNova custom-firmware
extended command **`regenerate_per_map_files`** (`research/extended_commands.py`).
The original implementation did:

```python
_shutil.copyfile(whole_pgm, slot_pgm)   # map.pgm -> map0.pgm, map1.pgm, ...
```

i.e. it **copied the whole-area `map.pgm` to every `mapN.pgm`**. Result on disk:

```
md5  map0.pgm == map1.pgm == map.pgm     (byte-identical)
free-bbox of both: x[-24.7..17.4]  ≈ 370 m²  (the ENTIRE property)
```

The original code comment assumed *"Coverage planner reads polygons from
csv_file/<slot>_work.csv anyway; the pgm only feeds Nav2's static costmap"*. **That
assumption is wrong.** The `coverage_planner_server` plans coverage **on the pgm**:

```
[coverage_planner_server]: Make plan by file: /userdata/lfi/maps/home0/map1.yaml
[coverage_planner_server]: No coverage map, using obstacle map to plan!!!     <-- plans on the pgm free space
[coverage_planner_server]: All coverage area: 321.301                          <-- both zones (map1=152.5, map0=221.8)
```

So with `map1.pgm` = the whole-area grid, mowing the Voortuin planned 321 m² (both
zones). `map0` happened to work (190 m²) only because the **dock sits inside
`map0`**, so coverage stayed bounded there; `map1`'s polygon doesn't contain the
dock/start, so the planner spread to the whole free region.

The work-CSV polygons themselves were always correct and distinct
(`map0_work.csv` x[-7..17], `map1_work.csv` x[-24..-10]) — only the pgms were dupes.

## When it was introduced

| build | when | state |
|---|---|---|
| custom-29 | 2026-05-11 09:51 | clean (before the commit) |
| commit `9db11976` "feat: per-map yaml mirror" | 2026-05-11 10:48 | — |
| **custom-30** | 2026-05-11 17:12 | **bug introduced** |
| … custom-35 | | all carry the bug |
| **custom-36** | 2026-06-07 | **fixed** |

The mirror was added to fix **Error 107** ("Loading map failed, please check mapN
file exists") after a restore/sync, since `save_map type:1` only writes the
whole-area triple and per-map files were missing. The fix to Error 107 introduced
the cover-everything regression — only visible once you actually mow a single zone
of a genuine multi-zone map.

## Fix (custom-36)

`handle_regenerate_per_map_files` now **masks** the whole `map.pgm` per slot instead
of copying it. For each slot it keeps FREE only:

- that slot's work polygon (inflated ~0.6 m so the pgm's offset free edge isn't clipped),
- the unicom corridors that touch that slot (`map<X>to<Y>` where the slot is an endpoint), kept ~1.4 m wide for connectivity,
- a disc around the charging pose (start cell),

and sets everything else OCCUPIED (`out = where(mask, whole, OCCUPIED)`). Uses
`numpy` + `PIL` (both present on the mower). Navigation is unaffected: nav2's
`map_server` loads the whole `map.yaml` separately; only the coverage planner reads
the per-map `mapN.yaml`.

Live result on LFIN2230700238 (Voortuin mow):

```
md5 map0.pgm != md5 map1.pgm                       (were identical)
map0 (achtertuin): 248 m²  x[-10.9..17.7]
map1 (voortuin):   150 m²  x[-25.0..0.8]           (was 321)
robot_decision: Total planned area: 150.22 → INIT_SUCCESS → MOVING   (no Error 107/127)
```

## Diagnostic commands (read-only, reusable)

```bash
# identical per-map pgm = the bug
ssh root@<mower> 'cd /userdata/lfi/maps/home0 && md5sum map0.pgm map1.pgm'

# planned coverage vs polygon size
grep -E "Make plan by file|All coverage area" \
  /root/novabot/data/ros2_log/coverage_planner_server_*.log | tail
cat /userdata/lfi/maps/home0/csv_file/map_info.json   # map_size per slot

# free-pixel bounding box of a pgm (where the mowable area actually is)
# python3 + numpy/PIL: value>=254 = free; convert px→world via map.yaml origin/res
```

## Related

- `docs/reference/MAP-SYNC.md` — map sync / restore.
- `docs/reference/REANCHOR.md` — re-anchoring (a separate concern; orientation/anchor were NOT the cause here).
- auto-memory: `per-map-pgm-coverage-bug.md`, `reanchor-dock-needs-position.md`.
