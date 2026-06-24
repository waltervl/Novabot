# Open Mapping Node — Phase 2 (Recording Subsystem) Design

**Status:** approved design, ready for plan
**Date:** 2026-06-24
**Branch:** `feat/open-mapping-phase2`
**Predecessors:** Phase 0 (scaffold + byte-diff oracle), Phase 1 (byte-exact `save_map`) — both merged to `master`.

## Goal

Reimplement the stock `novabot_mapping` node's **live recording** path: turn a
driven boundary (the robot's pose over time) into the clean boundary polygon
(the `x3` source) that Phase 1's `save_map` consumes. This gives the open node
the **in-memory simplified geometry** Phase 1 lacked, which is what makes the
occupancy rasters byte-exact at runtime (closing the Phase 1 raster deferral).

## Scope

**In:** the `Recording` service path — `start_scan_map` / `add_scan_map` /
`stop_scan_map` — for all area types (work=0, obstacle=1, unicom=2; the type
only labels the accumulated boundary). The rclpy node actually runs on the
mower: it subscribes to the pose source, the service handlers drive an
in-memory recording session, and on stop it writes `x3` and hands the boundary
to `save_map`.

**Out (→ Phase 3):** erase/edit (`start_erase_map` / `stop_erase_map` /
`eraseRecordingPoints`), `MappingControl` file-level editing, autonomous
(assistant) mapping.

## Architecture

Mirrors the Phase 1 split that Phase 0/1 proved: a **pure core** (no ROS,
offline-testable) under a **thin ROS node layer**.

### Components

- **`mapping/open_mapping/core/record.py`** (pure Python, no rclpy)
  - `RecordingSession` — holds one in-progress scan.
    - `start(area_type: int, map_name: str)` — begin a session.
    - `add(pose: tuple[float, float, float]) -> bool` — offer a pose `(x, y,
      yaw)`; appends a boundary point iff the firmware's **sampling rule**
      accepts it (distance/time gate — see Open RE item 2). Returns whether a
      point was added.
    - `stop() -> list[tuple[float, float]]` — return the raw accumulated
      boundary points.
  - `simplify_trajectory(points) -> list[tuple[float, float]]` — run
    `pyclipper.SimplifyPolygons` in integer space (same scale convention as
    `core/clipper.py`) to remove self-intersections/spikes from the dense
    self-crossing scan path, yielding the clean boundary = the `x3` polygon.

- **`open_mapping/node.py`** (extend the existing thin node)
  - Subscribe to the pose source (Open RE item 1); cache the latest pose via a
    `get_robot_pose()` accessor (the open analogue of `NovabotMapping::getRobotPose`).
  - Service handlers: `start_scan_map` → `RecordingSession.start`;
    `add_scan_map` → sample `get_robot_pose()` into `RecordingSession.add`
    (the stock node samples on a timer or per service tick, RE item 2);
    `stop_scan_map` → `stop()` → `simplify_trajectory()` → write `x3` →
    `core.save.save_map(boundary, ...)`.
  - Keep file I/O out of the pure handlers where Phase 1's pattern allows; the
    node layer owns the ROS + filesystem side.

- **`harness/capture_recording.py`** — capture, on the mower, the raw pose
  stream (the pose topic during a real stock drive) plus the complete stock
  output (`x3` + all `save_map` files). Freeze as a fixture.
- **`harness/replay_recording.py`** — feed a captured pose stream through
  `RecordingSession` + `simplify_trajectory` + `save_map`, and byte-compare the
  produced `x3` and rasters against the captured stock output.

### Data flow

```
mqtt_node ── start/add/stop_scan_map ──▶ node service handlers
   │  (while driving) sample get_robot_pose() ──▶ RecordingSession.add()
   ▼  stop_scan_map
RecordingSession.stop() ──▶ simplify_trajectory() ──▶ boundary (x3)
   ──▶ core.save.save_map(boundary, …) ──▶ all map files (Phase 1)
```

`save_map` now receives the in-memory simplified polygon as its bounds source,
not the on-disk `x3` — the missing input that prevented byte-exact rasters in
Phase 1.

## Validation (oracle: capture + replay, byte-exact incl. rasters)

1. **Capture (once, on the mower):** record the raw pose stream from the pose
   topic during a real stock drive, plus the full stock output (`x3` + every
   `save_map` file). Fixture shape: `pose_stream.jsonl` → expected `x3` +
   expected files.
2. **Replay (offline, deterministic):** feed the pose stream into
   `RecordingSession` → `simplify_trajectory` → `x3`; assert `x3` **byte-exact**
   (validates sampling + SimplifyPolygons). Then `save_map(boundary)` →
   rasters; assert rasters **byte-exact** (closes the Phase 1 raster gap, since
   bounds now come from the in-memory polygon).
3. **Unit tests:** the sampling rule and the simplify on synthetic
   trajectories.
4. **Live smoke test (last):** run the node on the mower for one short drive,
   confirm it produces a usable map.

Same TDD + fixture-corpus rhythm as Phase 0/1, run through the Phase 0
diff-oracle (`harness/diff_runner`) where applicable.

## Open RE items (resolve in Plan Task 1 — RE before building)

1. **Pose source topic.** What `NovabotMapping::getRobotPose` reads (a
   localization `/pose`, an odom topic, or a TF lookup) — needed to both
   subscribe and capture. Resolve from the binary + a matched-DDS live
   `ros2 topic`/`ros2 node info` (the Phase 0 follow-up about DDS env applies).
2. **Sampling rule.** How the stock node decides to append a boundary point
   (distance gate, time gate, or every tick) — the recorded boundaries are
   ~147 points for a full loop, implying dedup/distance gating, not raw pose
   rate.
3. **SimplifyPolygons byte-exactness.** Whether `pyclipper.SimplifyPolygons`
   matches stock `ClipperLib::SimplifyPolygons` byte-for-byte. **Risk:** the
   same patched-ClipperLib arc divergence that forced Strategy C on the offset
   in Phase 1. If it diverges, fall back to a **snapshot-validated clean
   simplify** (Strategy C analogue): produce the standard-library simplify,
   validate against a committed snapshot, document the divergence — do not
   reproduce a vendor patch.

## Risks

- **SimplifyPolygons divergence** could keep `x3` from being byte-exact (same
  class as the offset fan). Mitigation: Strategy C analogue above.
- **Pose source + sampling** are live-verified RE; wrong guesses produce
  wrong boundaries. Mitigation: RE Task 1 gates building.
- **Live capture feasibility** — capturing the pose topic on the mower must be
  possible without disrupting the stock node. Mitigation: passive `ros2 bag`/
  topic echo of the existing pose topic during a normal stock drive.

## Success criteria

- `core/record.py` is pure and offline-testable; the node layer carries the ROS
  + filesystem side.
- Replay of a captured real drive reproduces the stock `x3` byte-exact (or
  snapshot-clean with a documented, honest divergence) **and** the rasters
  byte-exact end-to-end through `save_map`.
- The node runs on the mower and records a usable map in a live smoke test.
- Erase/edit and autonomous mapping remain out of scope (Phase 3+).
