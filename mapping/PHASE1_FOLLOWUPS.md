# Phase 1 follow-ups (from Phase 0 reviews)

Phase 0 (scaffold + diff-oracle) is complete and merge-ready. These items were
deferred from the per-task and final whole-branch reviews — Phase 1 should pick
them up.

## Must do before any node activation
- **Verify the service name → type table on a live mower.** `open_mapping/services.py`
  is provisional-from-RE; `SERVICES_observed.txt` records that a fresh-shell
  `ros2 service list -t` saw 0 nodes (DDS env mismatch — the running nodes use a
  specific CycloneDDS config/`ROS_LOCALHOST_ONLY`/domain). Reconcile names/types
  with a matched DDS env, and correct the misleading "verified on mower" wording
  from commit e3e2797e. (Phase 0's table is structurally tested but unconfirmed
  against the live node.)

## Needed when Phase 1 implements save_map
- **Fuller golden capture.** `harness/fixtures/save_map_complex_map0/golden` only
  contains `csv_file/` + `x3_csv_file/`. The stock save also writes `mapN.pgm/png/
  yaml`, `map.pgm`, `map_info.json`, `charging_station.yaml` (per the spec and
  `core/save.py` docstring). Re-capture a complete golden so the byte-diff oracle
  covers all stock outputs.
- **`recorded_boundary.csv`** is committed in the fixture but `diff_runner.run_fixture`
  does not read it yet — it is the intended Phase 1 input to `save_map`.

## Tidy-ups (cosmetic, do opportunistically)
- Type hints: `services.by_name(name) -> ServiceDef`, `DiffReport.files: list[FileDiff]`.
- Dead `tarfile` import in `tests/test_capture.py`.
- `node.handle()` rebuilds the known-handlers set each call — hoist to a module const
  when `handle` gets wired to `core`.
- `node.get_logger().warn()` → `warning()` (deprecation rename; harmless on Galactic).
- Trailing newlines on fixture `request.json`/`meta.json`, `README.md`, and a few
  single-line files.
- `tarfile.extractall(..., filter="data")` once on Python ≥3.12 (silences the dev-box
  DeprecationWarning; not valid on the Py3.8 mower target, so guard by version).

## Phase 2 follow-ups (from Phase 1 final review)

Phase 1 delivered FUNCTIONAL 1:1 (byte-exact text outputs + clean csv offset + geometrically-correct rasters). These deferred to Phase 2 (the recording subsystem, which gives the in-memory geometry):

- **True raster byte-exactness (the core deferral).** pgm/png can't be byte-reproduced from disk x3 (firmware rasterises from an in-memory polygon post-SimplifyPolygons/expandPolygon + morphology dilate + dock circles, differing ~4-11 cells; corpus map.pgm also had navfix). Validate raster byte-exactness via a RUNTIME open-vs-stock comparison once the open node does its own recording→offset→simplify (Phase 2).
- **(Important) Orchestrator rasters not fidelity-checked end-to-end.** `save_map` derives canvas bounds from x3 (→375×246 vs golden 379×257), so `test_save_full.py`'s fidelity branch is dead code for the current corpus; the ~92-96% fidelity is only proven in `test_per_map_pgm`/`test_global_pgm` with hardcoded `CORPUS_BOUNDS`. In Phase 2, wire the post-simplify bounds and assert the orchestrator reaches the documented fidelity end-to-end.
- **`render_per_map_pgm` + global obstacle scope + `raster.py` bounds-param footgun.** Refactor the raster API once Phase 2 supplies real bounds (the bounds-param footgun is the same root cause as the fidelity gap).
- **overlap code 3 (CROSS_MULTI_MAPS).** Implement when a save path needs it (documented TODO).
- **Strategy-C clean csv vs the fan.** csv_file is the clean offset (snapshot-validated), not the stock patched-ClipperLib fan — this is effectively the intended Phase-5 fan fix arriving early; keep as-is.
- **Corpus diversity.** The 3 fixtures share one home0; add a second physical-map fixture (another mower / a Phase-2 runtime capture).
- **Minor cleanups:** `parse_csv` malformed-line guard; `clipper` redundant float round-trip; inner imports.
