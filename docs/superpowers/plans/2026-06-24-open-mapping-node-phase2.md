# Open Mapping Node — Phase 2 (Recording Subsystem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a driven boundary (robot pose over time) into the clean boundary polygon (the `x3` source) that Phase 1's `save_map` consumes, giving the open node the in-memory geometry that makes rasters byte-exact at runtime.

**Architecture:** A pure recording core (`core/record.py`, no ROS) under the existing thin rclpy node. The core samples poses into a trajectory and simplifies it (`pyclipper.SimplifyPolygons`) into the boundary; the node subscribes to the pose source, drives the core from the `Recording` service handlers, and on stop hands the boundary to `core.save.save_map`. Validation is capture-on-mower + offline replay, byte-comparing `x3` and rasters.

**Tech Stack:** Python 3.8 (mower target), `pyclipper`, `numpy`/`opencv-python` (already deps from Phase 1), `rclpy` (lazy-imported in the node only), pytest.

## Global Constraints

- Pure core: `core/record.py` imports NO rclpy and does NO file I/O. The node layer owns ROS + filesystem. (Same split Phase 0/1 proved.)
- Integer-space ClipperLib parity: scale factor `10000`, matching `core/clipper.py`'s `SCALE`.
- Byte-exact is the bar for `x3`; if `pyclipper.SimplifyPolygons` diverges from stock `ClipperLib::SimplifyPolygons`, fall back to a snapshot-validated clean simplify (Strategy C analogue) and mark the byte-equality test `@pytest.mark.xfail(strict=True)` with a documented reason. Do NOT reproduce a vendor patch.
- Raster byte-exactness (the Phase 1 deferral) is validated ONLY in the live replay task (Task 7), because it needs the real captured trajectory; offline raster tests stay structural.
- Recording covers area types work=0, obstacle=1, unicom=2 (the type only labels the boundary). Erase/edit and autonomous mapping are out of scope (Phase 3+).
- Constants discovered by RE live in `core/record_params.py` with cited binary evidence; code consumes them so logic is testable independent of the exact values.
- Tests run from `mapping/` (`cd mapping && python -m pytest`). Follow the existing `mapping/` layout and pytest config.

---

### Task 1: RE the pose source and sampling rule → `core/record_params.py`

Research task (binary analysis). Deliverable: the discovered constants plus a findings doc with cited evidence. No TDD cycle — verification is documented evidence and sane values.

**Files:**
- Create: `mapping/open_mapping/core/record_params.py`
- Create: `mapping/research/phase2-recording-RE.md`

**Interfaces:**
- Produces: `record_params.POSE_TOPIC: str`, `record_params.POSE_MSG_TYPE: str`, `record_params.MIN_POINT_DISTANCE_M: float` (the move-distance gate before a new boundary point is appended), `record_params.CLOSE_LOOP_DISTANCE_M: float | None` (auto-close threshold if the firmware uses one, else `None`).

- [ ] **Step 1: Disassemble the pose accessor.** On the mapping binary `/tmp/novabot_mapping_bin`, locate `NovabotMapping::getRobotPose` and the subscription/TF it reads. Commands to start from:
  ```bash
  llvm-nm /tmp/novabot_mapping_bin | grep -i getRobotPose
  strings /tmp/novabot_mapping_bin | grep -iE "/pose|/odom|localization|/tf|robot_pose|map_position"
  ```
  Identify the topic string + message type (geometry_msgs/Pose, nav_msgs/Odometry, or a TF `lookupTransform(map, base_link)`). Record the evidence (symbol, offset, the string).

- [ ] **Step 2: Find the sampling gate.** In `addScanMap`/recording handling, find the constant gating when a new point is appended to the trajectory (a distance comparison against the last point, e.g. a `vcmp`/`fsub`+`fcmp` against an immediate float). A full loop records ~147 points, so the gate is a move-distance threshold, not the raw pose rate. Record the float value and its evidence. If it cannot be cleanly recovered, set `MIN_POINT_DISTANCE_M = 0.10` and flag it in the findings doc as "default, confirm in Task 7".

- [ ] **Step 3: Write `core/record_params.py`** with the discovered values:
  ```python
  """RE-discovered recording constants. Evidence: research/phase2-recording-RE.md.

  Consumed by core/record.py so the recording logic is testable independent of
  these exact values. Confirm/correct against a live capture in Task 7.
  """

  # Pose source the stock NovabotMapping::getRobotPose reads (Task 1 RE).
  POSE_TOPIC = "<discovered topic>"
  POSE_MSG_TYPE = "<discovered msg type, e.g. geometry_msgs/msg/PoseStamped>"

  # A new boundary point is appended once the robot has moved at least this far
  # (metres) from the last appended point. ~147 points per full loop.
  MIN_POINT_DISTANCE_M = 0.10  # replace with RE value if recovered

  # Auto-close threshold (metres) if the firmware closes the loop itself; None if not.
  CLOSE_LOOP_DISTANCE_M = None
  ```

- [ ] **Step 4: Write the findings doc** `mapping/research/phase2-recording-RE.md` with: the pose topic + msg type + evidence; the sampling gate value + evidence (or "default, unconfirmed"); whether an auto-close exists; and an explicit "confirm in Task 7" list for anything not byte-certain.

- [ ] **Step 5: Commit**
  ```bash
  git add mapping/open_mapping/core/record_params.py mapping/research/phase2-recording-RE.md
  git commit -m "research(open-mapping): RE pose source + sampling rule for recording (Phase 2 Task 1)"
  ```

---

### Task 2: `RecordingSession` — pose accumulation with the sampling gate

**Files:**
- Create: `mapping/open_mapping/core/record.py`
- Test: `mapping/tests/test_record_session.py`

**Interfaces:**
- Consumes: `record_params.MIN_POINT_DISTANCE_M`.
- Produces: `class RecordingSession` with `start(area_type: int, map_name: str) -> None`, `add(pose: tuple[float, float, float]) -> bool` (pose is `(x, y, yaw)`; returns True iff a point was appended), `stop() -> list[tuple[float, float]]` (raw accumulated boundary points), and read-only attrs `area_type: int`, `map_name: str`, `active: bool`.

- [ ] **Step 1: Write the failing test**
  ```python
  # mapping/tests/test_record_session.py
  import math
  import pytest
  from open_mapping.core.record import RecordingSession
  from open_mapping.core import record_params

  def test_first_pose_is_always_added():
      s = RecordingSession()
      s.start(area_type=0, map_name="map0")
      assert s.add((1.0, 2.0, 0.0)) is True
      assert s.stop() == [(1.0, 2.0)]

  def test_pose_within_gate_is_dropped():
      s = RecordingSession()
      s.start(0, "map0")
      s.add((0.0, 0.0, 0.0))
      half = record_params.MIN_POINT_DISTANCE_M / 2.0
      assert s.add((half, 0.0, 0.0)) is False          # too close
      assert s.add((record_params.MIN_POINT_DISTANCE_M * 1.5, 0.0, 0.0)) is True
      assert s.stop() == [(0.0, 0.0), (record_params.MIN_POINT_DISTANCE_M * 1.5, 0.0)]

  def test_gate_measured_from_last_kept_point_not_cumulative():
      s = RecordingSession()
      s.start(0, "map0")
      step = record_params.MIN_POINT_DISTANCE_M * 0.6
      s.add((0.0, 0.0, 0.0))
      assert s.add((step, 0.0, 0.0)) is False           # 0.6*gate from last kept
      assert s.add((2 * step, 0.0, 0.0)) is True         # now 1.2*gate from last kept
      assert s.stop() == [(0.0, 0.0), (2 * step, 0.0)]

  def test_add_before_start_raises():
      s = RecordingSession()
      with pytest.raises(RuntimeError):
          s.add((0.0, 0.0, 0.0))

  def test_area_type_and_map_name_recorded():
      s = RecordingSession()
      s.start(area_type=1, map_name="map0")
      assert s.area_type == 1 and s.map_name == "map0" and s.active is True
      s.stop()
      assert s.active is False
  ```

- [ ] **Step 2: Run to verify it fails**
  Run: `cd mapping && python -m pytest tests/test_record_session.py -v`
  Expected: FAIL (no module `open_mapping.core.record`).

- [ ] **Step 3: Implement `RecordingSession`** in `core/record.py`:
  ```python
  """Pure recording core: pose accumulation + trajectory simplification.

  No rclpy, no file I/O (Global Constraints). The node layer feeds poses in and
  takes the simplified boundary out.
  """
  import math
  from open_mapping.core import record_params


  class RecordingSession:
      """One in-progress boundary scan. Appends a point once the robot has moved
      at least MIN_POINT_DISTANCE_M from the last kept point."""

      def __init__(self) -> None:
          self.active = False
          self.area_type = 0
          self.map_name = ""
          self._points: list[tuple[float, float]] = []

      def start(self, area_type: int, map_name: str) -> None:
          self.active = True
          self.area_type = int(area_type)
          self.map_name = str(map_name)
          self._points = []

      def add(self, pose: tuple[float, float, float]) -> bool:
          if not self.active:
              raise RuntimeError("add() before start()")
          x, y, _yaw = pose
          if not self._points:
              self._points.append((x, y))
              return True
          lx, ly = self._points[-1]
          if math.hypot(x - lx, y - ly) >= record_params.MIN_POINT_DISTANCE_M:
              self._points.append((x, y))
              return True
          return False

      def stop(self) -> list[tuple[float, float]]:
          self.active = False
          return list(self._points)
  ```

- [ ] **Step 4: Run to verify it passes**
  Run: `cd mapping && python -m pytest tests/test_record_session.py -v`
  Expected: PASS (5 passed).

- [ ] **Step 5: Commit**
  ```bash
  git add mapping/open_mapping/core/record.py mapping/tests/test_record_session.py
  git commit -m "feat(open-mapping): RecordingSession pose accumulation with sampling gate (Phase 2 Task 2)"
  ```

---

### Task 3: `simplify_trajectory` — ClipperLib SimplifyPolygons

**Files:**
- Modify: `mapping/open_mapping/core/record.py`
- Test: `mapping/tests/test_record_simplify.py`

**Interfaces:**
- Produces: `simplify_trajectory(points: list[tuple[float, float]]) -> list[tuple[float, float]]` — removes self-intersections/spikes from the dense scan path, returning the clean boundary (the `x3` polygon, single outer contour).

- [ ] **Step 1: Write the failing test**
  ```python
  # mapping/tests/test_record_simplify.py
  from open_mapping.core.record import simplify_trajectory

  def _area(poly):
      a = 0.0
      n = len(poly)
      for i in range(n):
          x1, y1 = poly[i]
          x2, y2 = poly[(i + 1) % n]
          a += x1 * y2 - x2 * y1
      return abs(a) / 2.0

  def test_clean_square_is_preserved():
      sq = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
      out = simplify_trajectory(sq)
      assert abs(_area(out) - 4.0) < 1e-6
      assert len(out) == 4

  def test_self_intersecting_bowtie_is_resolved():
      # Figure-eight: SimplifyPolygons splits/normalises self-intersections.
      bowtie = [(0.0, 0.0), (2.0, 2.0), (2.0, 0.0), (0.0, 2.0)]
      out = simplify_trajectory(bowtie)
      # The degenerate crossing is removed; result is a simple polygon (no
      # repeated crossing), area is one of the two triangles (1.0), not 0.
      assert _area(out) > 0.5

  def test_spike_is_removed():
      # A square with a thin out-and-back spike collapses back to the square.
      spike = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (1.0, 2.0),
               (1.0, 5.0), (1.0, 2.0), (0.0, 2.0)]
      out = simplify_trajectory(spike)
      assert abs(_area(out) - 4.0) < 1e-6

  def test_empty_and_degenerate_return_empty():
      assert simplify_trajectory([]) == []
      assert simplify_trajectory([(0.0, 0.0), (1.0, 1.0)]) == []
  ```

- [ ] **Step 2: Run to verify it fails**
  Run: `cd mapping && python -m pytest tests/test_record_simplify.py -v`
  Expected: FAIL (no `simplify_trajectory`).

- [ ] **Step 3: Implement `simplify_trajectory`** (append to `core/record.py`):
  ```python
  import pyclipper

  _SCALE = 10000  # integer-space scale, matches core/clipper.py SCALE

  def simplify_trajectory(points):
      """Run ClipperLib SimplifyPolygons on the dense scan path → clean boundary.

      Removes self-intersections/spikes the way stock NovabotMapping does before
      writing x3. Returns the largest-area resulting contour (the outer boundary)
      as float metres; [] for < 3 points or a degenerate result.
      """
      if len(points) < 3:
          return []
      scaled = [(int(round(x * _SCALE)), int(round(y * _SCALE))) for x, y in points]
      solution = pyclipper.SimplifyPolygon(scaled, pyclipper.PFT_NONZERO)
      if not solution:
          return []
      # Pick the largest-|area| contour as the outer boundary.
      def iarea(poly):
          a = 0
          n = len(poly)
          for i in range(n):
              x1, y1 = poly[i]
              x2, y2 = poly[(i + 1) % n]
              a += x1 * y2 - x2 * y1
          return abs(a)
      best = max(solution, key=iarea)
      if iarea(best) == 0:
          return []
      return [(x / _SCALE, y / _SCALE) for x, y in best]
  ```
  Note: `pyclipper.SimplifyPolygon` (singular) takes one path and returns a list of paths. If the RE in Task 1/7 shows stock calls `SimplifyPolygons` (plural, multiple input paths), adjust to `pyclipper.SimplifyPolygons([scaled], ...)`. The single-path form matches one driven loop.

- [ ] **Step 4: Run to verify it passes**
  Run: `cd mapping && python -m pytest tests/test_record_simplify.py -v`
  Expected: PASS (4 passed).

- [ ] **Step 5: Commit**
  ```bash
  git add mapping/open_mapping/core/record.py mapping/tests/test_record_simplify.py
  git commit -m "feat(open-mapping): simplify_trajectory via ClipperLib SimplifyPolygon (Phase 2 Task 3)"
  ```

---

### Task 4: `RecordingController` — tie session + simplify + save

**Files:**
- Modify: `mapping/open_mapping/core/record.py`
- Test: `mapping/tests/test_record_controller.py`

**Interfaces:**
- Consumes: `RecordingSession`, `simplify_trajectory`, and a save callback `save_fn(boundary, area_type, map_name) -> int` (returns an error_code; 0 = ok). In the node this is bound to `core.save.save_map`; in tests it is a fake.
- Produces: `class RecordingController` with `on_start(area_type, map_name) -> None`, `on_add(pose) -> bool`, `on_stop() -> dict` returning `{"boundary": list, "error_code": int}`. Holds exactly one session at a time.

- [ ] **Step 1: Write the failing test**
  ```python
  # mapping/tests/test_record_controller.py
  import pytest
  from open_mapping.core.record import RecordingController
  from open_mapping.core import record_params

  def _drive_square(ctrl, side=2.0):
      step = record_params.MIN_POINT_DISTANCE_M
      pts = []
      n = max(int(side / step), 1)
      for i in range(n + 1): pts.append((i * step, 0.0))
      for i in range(n + 1): pts.append((side, i * step))
      for i in range(n + 1): pts.append((side - i * step, side))
      for i in range(n + 1): pts.append((0.0, side - i * step))
      for x, y in pts: ctrl.on_add((x, y, 0.0))

  def test_stop_simplifies_and_saves():
      saved = {}
      def save_fn(boundary, area_type, map_name):
          saved["boundary"] = boundary; saved["type"] = area_type; saved["map"] = map_name
          return 0
      ctrl = RecordingController(save_fn)
      ctrl.on_start(0, "map0")
      _drive_square(ctrl)
      result = ctrl.on_stop()
      assert result["error_code"] == 0
      assert len(result["boundary"]) >= 4          # a closed boundary
      assert saved["type"] == 0 and saved["map"] == "map0"
      assert saved["boundary"] == result["boundary"]

  def test_save_error_code_propagates():
      ctrl = RecordingController(lambda b, t, m: 1)   # overlap reject
      ctrl.on_start(0, "map0")
      _drive_square(ctrl)
      assert ctrl.on_stop()["error_code"] == 1

  def test_stop_without_start_raises():
      ctrl = RecordingController(lambda b, t, m: 0)
      with pytest.raises(RuntimeError):
          ctrl.on_stop()

  def test_too_few_points_does_not_save():
      calls = []
      ctrl = RecordingController(lambda b, t, m: calls.append(1) or 0)
      ctrl.on_start(0, "map0")
      ctrl.on_add((0.0, 0.0, 0.0))
      result = ctrl.on_stop()
      assert result["boundary"] == [] and calls == []   # nothing saved
  ```

- [ ] **Step 2: Run to verify it fails**
  Run: `cd mapping && python -m pytest tests/test_record_controller.py -v`
  Expected: FAIL (no `RecordingController`).

- [ ] **Step 3: Implement `RecordingController`** (append to `core/record.py`):
  ```python
  class RecordingController:
      """Drives a RecordingSession from start/add/stop commands and, on stop,
      simplifies the trajectory and calls the save callback. ROS-free."""

      def __init__(self, save_fn):
          self._save_fn = save_fn
          self._session = None

      def on_start(self, area_type, map_name):
          self._session = RecordingSession()
          self._session.start(area_type, map_name)

      def on_add(self, pose):
          if self._session is None:
              raise RuntimeError("on_add() before on_start()")
          return self._session.add(pose)

      def on_stop(self):
          if self._session is None:
              raise RuntimeError("on_stop() before on_start()")
          raw = self._session.stop()
          boundary = simplify_trajectory(raw)
          self._session = None
          if len(boundary) < 4:
              return {"boundary": [], "error_code": 0}
          code = self._save_fn(boundary, 0, "")  # type/map filled below
          return {"boundary": boundary, "error_code": int(code)}
  ```
  Correction for the save call: the controller must pass the session's area_type/map_name. Capture them before clearing:
  ```python
      def on_stop(self):
          if self._session is None:
              raise RuntimeError("on_stop() before on_start()")
          area_type, map_name = self._session.area_type, self._session.map_name
          raw = self._session.stop()
          boundary = simplify_trajectory(raw)
          self._session = None
          if len(boundary) < 4:
              return {"boundary": [], "error_code": 0}
          code = self._save_fn(boundary, area_type, map_name)
          return {"boundary": boundary, "error_code": int(code)}
  ```
  Use the corrected `on_stop`.

- [ ] **Step 4: Run to verify it passes**
  Run: `cd mapping && python -m pytest tests/test_record_controller.py -v`
  Expected: PASS (4 passed).

- [ ] **Step 5: Commit**
  ```bash
  git add mapping/open_mapping/core/record.py mapping/tests/test_record_controller.py
  git commit -m "feat(open-mapping): RecordingController ties session+simplify+save (Phase 2 Task 4)"
  ```

---

### Task 5: Node wiring — pose subscription + Recording service handlers

**Files:**
- Modify: `mapping/open_mapping/node.py`
- Test: `mapping/tests/test_node_recording.py`

**Interfaces:**
- Consumes: `RecordingController`, `record_params.POSE_TOPIC`/`POSE_MSG_TYPE`.
- Produces: pure helper `handle_recording(controller, command, fields, latest_pose) -> dict` in `node.py` that maps a service command (`"start_scan_map"|"add_scan_map"|"stop_scan_map"`) onto the controller and returns `{"result": int, "error_code": int}` (result 0 = ok, matching stock `*_respond`). The rclpy wiring (subscription + service servers) calls this helper; the helper itself is ROS-free and tested directly.

- [ ] **Step 1: Write the failing test**
  ```python
  # mapping/tests/test_node_recording.py
  from open_mapping.core.record import RecordingController
  from open_mapping.core import record_params
  from open_mapping.node import handle_recording

  def test_start_then_stop_saves():
      saved = {}
      ctrl = RecordingController(lambda b, t, m: saved.setdefault("b", b) and 0 or 0)
      pose = [(0.0, 0.0, 0.0)]
      assert handle_recording(ctrl, "start_scan_map", {"type": 0, "mapName": "map0"}, pose[0])["result"] == 0
      step = record_params.MIN_POINT_DISTANCE_M
      for i in range(20):
          p = (i * step, 0.0, 0.0)
          handle_recording(ctrl, "add_scan_map", {}, p)
      # close the box quickly so simplify yields a polygon
      for x, y in [(20*step, 2.0), (0.0, 2.0), (0.0, 0.0)]:
          handle_recording(ctrl, "add_scan_map", {}, (x, y, 0.0))
      out = handle_recording(ctrl, "stop_scan_map", {}, (0.0, 0.0, 0.0))
      assert out["result"] == 0 and out["error_code"] == 0

  def test_stop_propagates_overlap_error_code():
      ctrl = RecordingController(lambda b, t, m: 1)
      handle_recording(ctrl, "start_scan_map", {"type": 0, "mapName": "map0"}, (0.0, 0.0, 0.0))
      for x, y in [(2.0, 0.0), (2.0, 2.0), (0.0, 2.0), (0.0, 0.0)]:
          handle_recording(ctrl, "add_scan_map", {}, (x, y, 0.0))
      assert handle_recording(ctrl, "stop_scan_map", {}, (0.0, 0.0, 0.0))["error_code"] == 1

  def test_unknown_command_returns_error_result():
      ctrl = RecordingController(lambda b, t, m: 0)
      assert handle_recording(ctrl, "bogus", {}, (0.0, 0.0, 0.0))["result"] != 0
  ```

- [ ] **Step 2: Run to verify it fails**
  Run: `cd mapping && python -m pytest tests/test_node_recording.py -v`
  Expected: FAIL (no `handle_recording`).

- [ ] **Step 3: Implement `handle_recording`** in `node.py` (add the pure helper; keep it free of rclpy):
  ```python
  def handle_recording(controller, command, fields, latest_pose):
      """Map a Recording service command onto the RecordingController.

      command: "start_scan_map" | "add_scan_map" | "stop_scan_map".
      fields:  parsed request fields (start uses {"type", "mapName"}).
      latest_pose: the most recent (x, y, yaw) from the pose subscription.
      Returns {"result": 0|1, "error_code": int} ; result 0 = ok (stock convention).
      """
      try:
          if command == "start_scan_map":
              controller.on_start(int(fields.get("type", 0)), str(fields.get("mapName", "map0")))
              return {"result": 0, "error_code": 0}
          if command == "add_scan_map":
              controller.on_add(latest_pose)
              return {"result": 0, "error_code": 0}
          if command == "stop_scan_map":
              out = controller.on_stop()
              return {"result": 0, "error_code": out["error_code"]}
          return {"result": 1, "error_code": 0}
      except Exception:
          return {"result": 1, "error_code": 0}
  ```

- [ ] **Step 4: Wire the rclpy side (no unit test — exercised live in Task 7).** In the node's setup, add the pose subscription and the three service servers, each delegating to `handle_recording`. Keep the live wiring minimal:
  ```python
  # in the node __init__ (rclpy import stays lazy/local as in Phase 0/1):
  # self._controller = RecordingController(self._save_boundary)
  # self._latest_pose = (0.0, 0.0, 0.0)
  # subscribe POSE_TOPIC -> self._on_pose (cache (x, y, yaw))
  # create services start_scan_map/add_scan_map/stop_scan_map ->
  #   build fields from the request, call handle_recording(self._controller, name, fields, self._latest_pose),
  #   copy result/error_code onto the response.
  # self._save_boundary(boundary, area_type, map_name): write x3 to the map dir and
  #   call core.save.save_map with the in-memory boundary, return its error_code.
  ```
  Add a short docstring noting the live wiring is validated in Task 7 (no offline ROS test).

- [ ] **Step 5: Run the helper test to verify it passes**
  Run: `cd mapping && python -m pytest tests/test_node_recording.py -v`
  Expected: PASS (3 passed).

- [ ] **Step 6: Commit**
  ```bash
  git add mapping/open_mapping/node.py mapping/tests/test_node_recording.py
  git commit -m "feat(open-mapping): node Recording handlers + pose subscription wiring (Phase 2 Task 5)"
  ```

---

### Task 6: Capture + replay harness (code + synthetic replay test)

**Files:**
- Create: `mapping/harness/capture_recording.py`
- Create: `mapping/harness/replay_recording.py`
- Test: `mapping/tests/test_replay_recording.py`

**Interfaces:**
- Produces: `capture_recording` CLI (run on the mower: subscribe POSE_TOPIC, write `pose_stream.jsonl` of `{"x","y","yaw","t"}` lines while a stock drive happens; the operator copies the stock output dir alongside). `replay_recording.replay(pose_stream_path, save_fn) -> dict` feeds the stream through a `RecordingController` and returns `{"boundary": list, "error_code": int}`.

- [ ] **Step 1: Write the failing test** (synthetic stream → boundary; proves the replay wiring, not byte-exactness):
  ```python
  # mapping/tests/test_replay_recording.py
  import json, pathlib
  from open_mapping.core import record_params
  from harness.replay_recording import replay

  def test_replay_synthetic_stream_produces_boundary(tmp_path):
      step = record_params.MIN_POINT_DISTANCE_M
      stream = tmp_path / "pose_stream.jsonl"
      pts = []
      for i in range(20): pts.append((i * step, 0.0))
      for i in range(20): pts.append((20 * step, i * step))
      for i in range(20): pts.append((20 * step - i * step, 20 * step))
      for i in range(20): pts.append((0.0, 20 * step - i * step))
      with stream.open("w") as f:
          for x, y in pts:
              f.write(json.dumps({"x": x, "y": y, "yaw": 0.0, "t": 0.0}) + "\n")
      saved = {}
      out = replay(str(stream), lambda b, t, m: saved.setdefault("b", b) and 0 or 0)
      assert out["error_code"] == 0
      assert len(out["boundary"]) >= 4
  ```

- [ ] **Step 2: Run to verify it fails**
  Run: `cd mapping && python -m pytest tests/test_replay_recording.py -v`
  Expected: FAIL (no `harness.replay_recording`).

- [ ] **Step 3: Implement `replay_recording.py`**:
  ```python
  """Replay a captured pose stream through the recording core (offline)."""
  import json
  from open_mapping.core.record import RecordingController

  def replay(pose_stream_path, save_fn, area_type=0, map_name="map0"):
      ctrl = RecordingController(save_fn)
      ctrl.on_start(area_type, map_name)
      with open(pose_stream_path) as f:
          for line in f:
              line = line.strip()
              if not line:
                  continue
              r = json.loads(line)
              ctrl.on_add((r["x"], r["y"], r.get("yaw", 0.0)))
      return ctrl.on_stop()
  ```

- [ ] **Step 4: Implement `capture_recording.py`** (mower-side CLI; no offline test — run live in Task 7):
  ```python
  """Run ON THE MOWER: echo the pose topic to pose_stream.jsonl during a stock
  drive. Pair the resulting file with the stock map output dir to form a Task 7
  fixture. Uses rclpy; imported lazily so this file does not affect offline tests.
  """
  import json, sys, time

  def main(out_path, topic, duration_s=600):
      import rclpy
      from rclpy.node import Node
      # NOTE: import the msg type discovered in Task 1 (record_params.POSE_MSG_TYPE).
      # Subscribe `topic`, and on each message append
      #   {"x":..., "y":..., "yaw":..., "t": time.time()} to out_path.
      # Extract yaw from the quaternion (z,w) the same way getRobotPose does.
      ...

  if __name__ == "__main__":
      main(sys.argv[1], sys.argv[2])
  ```
  Keep the rclpy import inside `main` so importing the module offline never needs ROS. The `...` body is filled when running on the mower in Task 7 (it needs the exact msg type from Task 1); leave a clear `# Task 7:` comment, not a silent stub.

- [ ] **Step 5: Run the replay test to verify it passes**
  Run: `cd mapping && python -m pytest tests/test_replay_recording.py -v`
  Expected: PASS (1 passed).

- [ ] **Step 6: Commit**
  ```bash
  git add mapping/harness/capture_recording.py mapping/harness/replay_recording.py mapping/tests/test_replay_recording.py
  git commit -m "feat(open-mapping): capture+replay recording harness (Phase 2 Task 6)"
  ```

---

### Task 7: LIVE — capture a real drive, confirm params, byte-validate x3 + rasters

Gated on a live mower. This is the task that closes the loop: it captures a real trajectory, confirms/corrects the Task 1 constants, and proves the open recording reproduces stock `x3` and (through Phase 1's `save_map`) the rasters byte-exact.

**Files:**
- Create: `mapping/harness/fixtures/recording_<map>/pose_stream.jsonl` (captured)
- Create: `mapping/harness/fixtures/recording_<map>/golden/` (stock output: `x3_csv_file/*`, `csv_file/*`, `mapN.pgm/png/yaml`, `map.pgm`, `map_info.json`, `charging_station.yaml`)
- Create: `mapping/tests/test_recording_replay_golden.py`
- Modify (if needed): `mapping/open_mapping/core/record_params.py`, `mapping/open_mapping/core/record.py`

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Capture on the mower.** With the stock node running, drive one work boundary while `capture_recording.py` echoes the pose topic to `pose_stream.jsonl`. Copy the resulting stock map dir as `golden/`. Verify the pose topic + msg type from Task 1 are correct; correct `record_params.POSE_TOPIC`/`POSE_MSG_TYPE` if not.

- [ ] **Step 2: Tune the sampling gate against the golden x3.** Replay the captured stream and compare point count + the produced `x3` against `golden/x3_csv_file/*`. Adjust `record_params.MIN_POINT_DISTANCE_M` until the replayed `x3` point set matches the golden (this is the one RE value most likely to need tuning). Document the confirmed value in `research/phase2-recording-RE.md`.

- [ ] **Step 3: Write the golden replay test**
  ```python
  # mapping/tests/test_recording_replay_golden.py
  import pathlib, pytest
  from harness.replay_recording import replay
  from open_mapping.core.record import simplify_trajectory

  FIX = pathlib.Path(__file__).parent.parent / "harness/fixtures/recording_map0"

  def _read_x3(path):  # join all x3 csv bytes in name order
      parts = sorted((FIX / path).glob("*.csv"))
      return b"".join(p.read_bytes() for p in parts)

  @pytest.mark.skipif(not FIX.exists(), reason="live fixture not captured yet")
  def test_replayed_x3_matches_golden_bytes():
      captured = []
      replay(str(FIX / "pose_stream.jsonl"), lambda b, t, m: captured.append(b) or 0)
      # write captured boundary to x3 format via core.geometry.format_csv and compare
      from open_mapping.core.geometry import format_csv
      produced = "".join(format_csv(x, y) for x, y in captured[0]).encode()
      assert produced == _read_x3("golden/x3_csv_file")
  ```
  If `pyclipper.SimplifyPolygon` does NOT reproduce the golden `x3` byte-for-byte (the ClipperLib-patch risk), mark this test `@pytest.mark.xfail(strict=True)` with a reason citing the divergence, snapshot the produced clean `x3` as `golden_clean/`, and assert against the snapshot instead (Strategy C analogue). Document in the RE doc.

- [ ] **Step 4: Byte-validate the rasters end-to-end.** Extend the test so that after producing the boundary, it runs `core.save.save_map` with the in-memory boundary and compares the produced `mapN.pgm`/`map.pgm` against `golden/` byte-for-byte. This is the Phase 1 raster deferral being closed: with the real in-memory polygon the canvas bounds match. If a residual cell difference remains, record the exact diff and whether it is the dock-disc/dilate path (fix in `core/raster.py`) or a genuine bounds mismatch.
  ```python
  @pytest.mark.skipif(not FIX.exists(), reason="live fixture not captured yet")
  def test_replayed_rasters_match_golden_bytes(tmp_path):
      from open_mapping.core import save
      boundary = {}
      replay(str(FIX / "pose_stream.jsonl"), lambda b, t, m: boundary.setdefault("b", b) or 0)
      # save_map from the in-memory boundary into tmp_path, then:
      for name in ["map.pgm", "map0.pgm"]:
          assert (tmp_path / name).read_bytes() == (FIX / "golden" / name).read_bytes()
  ```

- [ ] **Step 5: Run the full suite**
  Run: `cd mapping && python -m pytest -q`
  Expected: PASS (all prior tasks) + the golden tests PASS (or xfail with documented reason for the simplify byte gap). Record the count.

- [ ] **Step 6: Commit**
  ```bash
  git add mapping/harness/fixtures/recording_map0 mapping/tests/test_recording_replay_golden.py mapping/open_mapping/core/record_params.py mapping/open_mapping/core/record.py mapping/research/phase2-recording-RE.md
  git commit -m "test(open-mapping): live recording replay byte-validates x3 + rasters (Phase 2 Task 7)"
  ```

---

## Self-Review

**Spec coverage:** core/record.py (Tasks 2-4) = the pure recording core; node wiring (Task 5) = the thin ROS layer; capture+replay harness (Task 6) + live byte-validation (Task 7) = the oracle; record_params + findings (Task 1) = the RE items; Strategy C analogue for SimplifyPolygons (Task 3 note + Task 7 Step 3) and raster byte-exactness closure (Task 7 Step 4) are both covered. Scope (work/obstacle/unicom; erase/autonomous out) is in Global Constraints. No gaps.

**Placeholders:** Task 1's `<discovered topic>` and Task 6/7's mower-side bodies are intentionally RE-/capture-gated, each marked with an explicit `Task 7:` instruction, not a silent TODO. All offline code (Tasks 2-6) is complete.

**Type consistency:** `RecordingSession.add` returns bool, `stop` returns list of (x,y); `simplify_trajectory(list)->list`; `RecordingController(save_fn)` with `save_fn(boundary, area_type, map_name)->int`; `handle_recording(controller, command, fields, latest_pose)->{"result","error_code"}`. Consistent across tasks.
