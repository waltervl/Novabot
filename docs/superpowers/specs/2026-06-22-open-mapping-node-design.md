# Open Mapping Node — Design (Phase 0: scaffold + diff-oracle)

Date: 2026-06-22
Status: approved for Phase 0

## Context

`novabot_mapping` is the stock closed-source C++ ROS2 node on the mower. It owns
the whole map pipeline: recording driven boundaries, writing `csv_file/` +
`x3_csv_file/` CSVs, generating the `mapN.pgm/png/yaml` + `map.pgm` occupancy
grids, overlap detection, charging-pose handling, and the file-level
`MappingControl` operations. `mqtt_node` drives it via ROS2 service calls
(`add_scan_map`, `start_scan_map`, `stop_scan_map`, `save_map`, `start_erase_map`,
`stop_erase_map`, …).

It has bugs we cannot fix without source. The most concrete (RE'd 2026-06-21,
see `research/documents/novabot-modify-map-flow.md` and the disassembly findings):
`saveScanData` writes `csv_file/mapN_work.csv` from `expandPolygon(work, obstacle,
unicom, charge_unicom)`, which runs `ClipperLib::ClipperOffset::Execute` on the
work boundary. For a complex map (obstacles + unicoms + charger) Clipper returns
many solution contours and **all** are written → the same boundary duplicated
~23× ("fan"). The clean `x3_csv_file/` copy escapes because it is written from
the raw recording before `expandPolygon` runs.

The node is already heavily reverse-engineered: `novabot-mapping-pgm-occupancy-
flow.md` reproduces `map.pgm` to 96%, `coverage-planner-reverse-engineering.md`
covers the adjacent planner, and `mower/` (open robot_decision) + the
`2026-04-26-open-mqtt-node` spec establish a proven Python-replacement pattern.

## Goal & decisions

Build an open-source, drop-in replacement for `novabot_mapping`.

| Decision | Choice | Rationale |
|---|---|---|
| Scope | **Full drop-in parity** (all 7 services + autonomous mapping) | User goal: own the whole map pipeline. Too large for one spec → decomposed into phases. |
| Language | **Python (rclpy)** | Mirrors `mower/` robot_decision. Geometry+raster via numpy/shapely/PIL (extended_commands already does pgm/numpy). Fast to iterate, easy to open-source. |
| Fidelity | **Byte-identical to stock** (incl. quirks AND bugs) | Strongest, diff-provable parity. Bug fixes are a later explicit superset (Phase 5) on top of a verified-identical base. |
| Diff-oracle | **Frozen golden fixtures from the live mower** | Byte-identical iteration needs a fast offline oracle; capture once, diff forever, no mower/ROS needed per run. (arm64-qemu replay = later stretch.) |

The 7 `mapping_msgs` service types: `Recording`, `Mapping`, `MappingControl`,
`SetChargingPose`, `GenerateEmptyMap`, `StopAutoRecording`, `SaveRecording`.

## Phasing (each phase = its own spec → plan → build cycle)

- **Phase 0 — Scaffold + diff-oracle (THIS spec).** rclpy node skeleton claiming
  the service names (stub responses), `deploy.sh`/`wrapper.sh` (not yet
  activated), and the golden-fixture capture + diff-runner harness.
- **Phase 1 — Save/generate pipeline (byte-exact).** `Mapping` (save_map 0/1):
  csv + x3 writes, `expandPolygon` (Clipper-offset port, incl. the fan),
  rasterization → pgm/png/yaml + map.pgm, map_info.json, charging_station.yaml,
  overlap detection + error codes. The most-RE'd part.
- **Phase 2 — Recording subsystem.** start/add/stop_scan_map: subscribe to
  localization, accumulate the driven trajectory → boundary polygon (the x3
  source) that feeds Phase 1.
- **Phase 3 — MappingControl + edit.** EDIT_MAP, add/delete submap, add/delete
  obstacle, add unicom.
- **Phase 4 — Charging pose + GenerateEmptyMap + autonomous mapping + rest.**
- **Phase 5 — Bug-fix superset (explicit, after proven 1:1).** Dedupe the
  expandPolygon contours (the fan fix), etc., on top of the verified base.

## Phase 0 design

### Architecture & repo layout

New top-level `mapping/` (mirrors `mower/`). The node splits into a thin ROS
layer and a pure, ROS-free core that is byte-diffable against golden fixtures.

```
mapping/
  open_mapping/                  # ROS2 Python package
    node.py                      # rclpy: claims service NAMES (thin), delegates to core/
    core/                        # PURE python, NO ROS — byte-diffable
      recording.py               # trajectory → boundary polygon
      save.py                    # save_map orchestration
      expand_polygon.py          # Clipper-offset port (incl. the fan)
      raster.py                  # polygon → pgm/png/yaml occupancy
      overlap.py                 # detect_overlapping + error codes
      mapfiles.py                # csv_file/x3_csv_file, map_info.json, charging_station.yaml
      geometry.py                # shared primitives (point-in-poly etc.)
  harness/
    capture.py                   # snapshot map-dir + request → golden fixture (from mower)
    diff_runner.py               # run core on fixture input, byte-diff vs golden
    fixtures/                    # frozen golden fixtures (committed)
  tests/                         # pytest (mirrors mower/tests)
  deploy.sh + wrapper.sh         # wrapper-replace activation strategy
  README.md
```

Principle: `node.py` only (de)serializes ROS requests and calls `core/`. Each
`core/` module has one purpose and a clear interface, testable without ROS or the
mower. In Phase 0 the `core/` modules are stubs; the harness still exercises the
full capture→run→diff loop.

### Service surface

`node.py` registers the service **names** `mqtt_node` calls, each of the matching
`mapping_msgs` type:

| Service type | Req → Resp |
|---|---|
| `Recording` | `type:0/1/2` → `result, message` |
| `Mapping` (save_map) | `resolution, type:0/1, main_id` → `result, message, error_code (1=OVERLAP_MAP, 2=OVERLAP_UNICOM, 3=CROSS_MULTI_MAPS)` |
| `MappingControl` | `map_file_name, child_map_file_name, obstacle_file_name, unicom_area_file_name, type:1-10` → `result, message` |
| `SetChargingPose` | `control_mode (0=read,1=write), map_file_name, child_map_file_name` → `charging_pose (geometry_msgs/Pose), result, map_to_charging_dis, charging_pile_orientation` |
| `GenerateEmptyMap`, `StopAutoRecording`, `SaveRecording` | (remaining contracts) |

**Phase 0 task:** discover the exact service-NAME → service-TYPE mapping from the
stock node + `mqtt_node` clients (e.g. service name `add_scan_map` of type
`Recording`), so the registered names are 1:1.

### Golden-fixture format & capture

A fixture freezes the inputs and outputs of one stock operation:

```
fixtures/save_map_complex_map0/
  input/
    mapdir_before.tar         # csv_file/ + x3_csv_file/ + map.yaml etc. before the op
    request.json              # {service:"save_map", type:1, resolution:0.05, main_id:0}
    recorded_boundary.csv     # the recorded boundary points (the save input)
  golden/
    mapdir_after.tar          # every file the stock node wrote (csv/x3/pgm/png/yaml/map_info/charging_station)
  meta.json                   # firmware version, SN, timestamp, log citation ("recording points:147")
```

`capture.py` runs against the live mower over ssh: snapshot the map dir →
trigger/observe the stock operation → snapshot the map dir after → package as a
fixture. The `recorded_boundary` is taken from node state (the post-save `x3` ==
the raw recording, as observed this session). Phase 0 pins this down with **one
concrete fixture** (the `save_map` on the complex map0 we already have data for).

### Diff-runner & success criteria

`diff_runner.py` takes a fixture, runs the relevant `core/` function on `input/`,
writes output to a temp dir, and **byte-diffs against `golden/`** — per file:
match / differ (text diff for csv/yaml, byte + structural diff for pgm).

In Phase 0 `core/` is a stub, so the diff reports MISMATCH — and that is the
success: the oracle captured golden, ran the core, and reported exactly what
Phase 1 must reproduce. The pipeline stands.

**Phase 0 is done when:**

1. Repo scaffold + rclpy node skeleton (claims service names, stub responses)
   imports and registers its services.
2. `deploy.sh` + `wrapper.sh` (wrapper-replace, `.orig` backup,
   `ROS_LOCALHOST_ONLY=1`) — `--status`/dry-run works. **Not** activated in
   production (the stub would break mapping; activation waits until a later phase
   is byte-verified).
3. ≥1 real golden fixture captured from the mower and committed (the `save_map`
   we already have).
4. `diff_runner` runs the stub core on that fixture and reports the byte-diff —
   oracle proven end-to-end.
5. pytest infra in place (mirrors `mower/tests`).

### Activation (prepared, not performed in Phase 0)

`wrapper.sh` replaces the stock `novabot_mapping` binary (original → `.orig`);
`deploy.sh` does deploy / `--hot` / `--rollback` / `--status`, mirroring
`mower/deploy.sh` (wrapper-replace keeps DDS timing intact, no kill/restart).
Phase 0 ships this but does not activate — activation happens once a later phase
is byte-verified against the golden fixtures.

## Out of scope (Phase 0)

- Any real `core/` logic (Phases 1–4).
- Off-device arm64-qemu binary replay for on-demand fixture generation (later
  stretch of the diff-oracle approach).
- Bug fixes incl. the expandPolygon/fan dedup (Phase 5, explicit, after 1:1).
- Production activation of the Python node.
