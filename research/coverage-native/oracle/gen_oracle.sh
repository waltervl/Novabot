#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"

MODE="quick"
IMAGE="cov-replay-lean"
CLEAN=0

usage() {
  cat <<'EOF'
usage: gen_oracle.sh [--quick|--full] [--clean] [--image IMAGE]

Build the coverage-native oracle corpus from local firmware/replay fixtures.

  --quick        Generate the fast default matrix used during native port work.
  --full         Generate all copied cases, all start seeds, all directions.
  --clean        Remove generated cases and goldens before staging.
  --image IMAGE  Docker image containing the replay wrapper (default: cov-replay-lean).
EOF
}

while (($#)); do
  case "$1" in
    --quick)
      MODE="quick"
      shift
      ;;
    --full)
      MODE="full"
      shift
      ;;
    --clean)
      CLEAN=1
      shift
      ;;
    --image)
      IMAGE="${2:-}"
      test -n "$IMAGE" || { usage >&2; exit 2; }
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "gen_oracle: Docker image '$IMAGE' is missing. Build research/coverage-replay/Dockerfile.lean first." >&2
  exit 1
fi

if [[ "$CLEAN" -eq 1 ]]; then
  rm -rf "$ROOT/cases" "$ROOT/goldens" "$ROOT/missing-adversarial-cases.tsv"
fi

mkdir -p "$ROOT/cases" "$ROOT/goldens/grid" "$ROOT/goldens/logs" "$ROOT/goldens/world"

python3 - "$ROOT" "$REPO_ROOT" <<'PY'
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

root = Path(sys.argv[1])
repo = Path(sys.argv[2])
cases_dir = root / "cases"
world_dir = root / "goldens" / "world"
cases_dir.mkdir(parents=True, exist_ok=True)
world_dir.mkdir(parents=True, exist_ok=True)

case_sources = [
    ("replay_demo_show", "research/coverage-replay/cp/share/coverage_planner/map/demo_show.pgm", "coverage_planner/share/map demo_show"),
    ("replay_test_low_efficiency", "research/coverage-replay/cp/share/coverage_planner/map/test_low_efficiency.pgm", "coverage_planner/share/map test_low_efficiency"),
    ("replay_map", "research/coverage-replay/cp/share/coverage_planner/map/map.pgm", "coverage_planner/share/map map"),
    ("replay_zxl_own_house", "research/coverage-replay/cp/share/coverage_planner/map/zxl_own_house.pgm", "coverage_planner/share/map zxl_own_house"),
    ("debug_sh_map", "research/firmware/mower_firmware_6.0.3/debug_sh/map.pgm", "mower_firmware_6.0.3 debug_sh map"),
    ("debug_sh_map0", "research/firmware/mower_firmware_6.0.3/debug_sh/map0.pgm", "mower_firmware_6.0.3 debug_sh map0"),
    ("debug_sh_home0_map0", "research/firmware/mower_firmware_6.0.3/debug_sh/home0/map0.pgm", "mower_firmware_6.0.3 debug_sh home0/map0"),
    ("debug_sh_home0_map1", "research/firmware/mower_firmware_6.0.3/debug_sh/home0/map1.pgm", "mower_firmware_6.0.3 debug_sh home0/map1"),
    ("lfin1231000211_backup_map0", "research/maps/LFIN1231000211_backup_20260409_1118/mower_home0/map0.pgm", "LFIN1231000211 backup 20260409 map0"),
    ("live_lfin2230700238_20260611_map0", "research/coverage-native/oracle/live/lfin2230700238_20260611_map0/map0.pgm", "LFIN2230700238 live capture 2026-06-11 map0"),
]

manual_start_sources = {
    "live_lfin2230700238_20260611_map0": "research/coverage-native/oracle/live/lfin2230700238_20260611_map0/start_pose.json",
}

adversarial_sources = [
    "self_intersection/house_map.pgm",
    "self_intersection/map2.pgm",
    "collinear_map_11inflation/map2.pgm",
    "dead_cycle_map/map2.pgm",
    "user_maps/narrow_and_self_intersection.pgm",
]

adversarial_roots = [
    repo / "research/coverage-replay/cp/share/coverage_planner/data",
    repo / "research/firmware/mower_firmware_6.0.3/install/coverage_planner/share/coverage_planner/data",
    repo / "research/firmware/mower_firmware_v6.0.2/install/coverage_planner/share/coverage_planner/data",
]

world_sources = [
    ("debug_sh_map0", "research/firmware/mower_firmware_6.0.3/debug_sh/planned_path"),
    ("debug_sh_home0_map0", "research/firmware/mower_firmware_6.0.3/debug_sh/home0/planned_path"),
    ("lfin1231000211_backup_map0", "research/maps/LFIN1231000211_backup_20260409_1118/mower_home0/planned_path"),
    ("live_lfin2230700238_20260611_map0", "research/coverage-native/oracle/live/lfin2230700238_20260611_map0/planned_path"),
]


def read_token(blob: bytes, idx: int) -> tuple[str, int]:
    while idx < len(blob):
        c = blob[idx:idx + 1]
        if c in b" \t\r\n":
            idx += 1
            continue
        if c == b"#":
            while idx < len(blob) and blob[idx:idx + 1] not in b"\r\n":
                idx += 1
            continue
        break
    start = idx
    while idx < len(blob) and blob[idx:idx + 1] not in b" \t\r\n":
        idx += 1
    return blob[start:idx].decode("ascii"), idx


def read_pgm(path: Path) -> tuple[int, int, int, bytes]:
    blob = path.read_bytes()
    idx = 0
    magic, idx = read_token(blob, idx)
    if magic != "P5":
        raise ValueError(f"{path} is {magic}, expected raw P5")
    width_s, idx = read_token(blob, idx)
    height_s, idx = read_token(blob, idx)
    max_s, idx = read_token(blob, idx)
    while idx < len(blob) and blob[idx:idx + 1] in b" \t\r\n":
        idx += 1
    width = int(width_s)
    height = int(height_s)
    max_value = int(max_s)
    pixels = blob[idx:idx + width * height]
    if len(pixels) != width * height:
        raise ValueError(f"{path} has {len(pixels)} pixels, expected {width * height}")
    return width, height, max_value, pixels


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def nearest(points: list[tuple[int, int]], target: tuple[float, float]) -> tuple[int, int]:
    tx, ty = target
    return min(points, key=lambda p: (p[0] - tx) * (p[0] - tx) + (p[1] - ty) * (p[1] - ty))


def starts_for(path: Path) -> list[tuple[str, int, int, str]]:
    width, height, _max, pixels = read_pgm(path)
    free = [(i % width, i // width) for i, v in enumerate(pixels) if v >= 250]
    method = "pixel>=250"
    if not free:
        free = [(i % width, i // width) for i, v in enumerate(pixels) if v > 200]
        method = "pixel>200"
    if not free:
        return []

    xs = [x for x, _y in free]
    ys = [y for _x, y in free]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    targets = [
        ((sum(xs) / len(xs), sum(ys) / len(ys)), "free_centroid"),
        ((min_x + (max_x - min_x) * 0.25, min_y + (max_y - min_y) * 0.25), "bbox_q1"),
        ((min_x + (max_x - min_x) * 0.75, min_y + (max_y - min_y) * 0.75), "bbox_q3"),
    ]
    out: list[tuple[str, int, int, str]] = []
    seen: set[tuple[int, int]] = set()
    for target, label in targets:
        pt = nearest(free, target)
        if pt in seen:
            continue
        seen.add(pt)
        out.append((f"s{len(out)}", pt[0], pt[1], f"{method}:{label}"))
    return out


copied_cases: list[tuple[str, Path, str, int, int, int, str]] = []
for name, rel, note in case_sources:
    src = repo / rel
    if not src.exists():
        continue
    dst = cases_dir / f"{name}.pgm"
    shutil.copyfile(src, dst)
    width, height, max_value, _pixels = read_pgm(dst)
    copied_cases.append((name, dst, rel, width, height, max_value, note))

with (cases_dir / "manifest.tsv").open("w", encoding="utf-8") as f:
    f.write("case\twidth\theight\tmax_value\tsha256\tsource\tnote\n")
    for name, dst, rel, width, height, max_value, note in copied_cases:
        f.write(f"{name}\t{width}\t{height}\t{max_value}\t{sha256(dst)}\t{rel}\t{note}\n")

with (cases_dir / "starts.tsv").open("w", encoding="utf-8") as f:
    f.write("case\tstart_label\tx\ty\tmethod\n")
    for name, dst, _rel, _width, _height, _max_value, _note in copied_cases:
        for label, x, y, method in starts_for(dst):
            f.write(f"{name}\t{label}\t{x}\t{y}\t{method}\n")
        start_rel = manual_start_sources.get(name)
        if start_rel:
            start_path = repo / start_rel
            if start_path.exists():
                start = json.loads(start_path.read_text(encoding="utf-8"))["start"]
                grid = start["grid"]
                cov_direction = start.get("cov_direction", "auto")
                f.write(
                    f"{name}\tlive_start\t{grid['x']}\t{grid['y']}\t"
                    f"planner_log:cov_direction={cov_direction}\n"
                )

with (root / "missing-adversarial-cases.tsv").open("w", encoding="utf-8") as f:
    f.write("fixture\tstatus\tlocal_path\tcase\n")
    for rel in adversarial_sources:
        found = next((base / rel for base in adversarial_roots if (base / rel).exists()), None)
        if found is None:
            f.write(f"{rel}\tmissing\t\t\n")
            continue
        case_name = "adversarial_" + rel.replace("/", "_").replace(".pgm", "")
        dst = cases_dir / f"{case_name}.pgm"
        shutil.copyfile(found, dst)
        f.write(f"{rel}\tcopied\t{found.relative_to(repo)}\t{case_name}\n")

with (world_dir / "manifest.tsv").open("w", encoding="utf-8") as f:
    f.write("case\tplanned_path_json\tcurrent_planned_path_json\tsource_dir\n")
    for case_name, rel_dir in world_sources:
        src_dir = repo / rel_dir
        if not src_dir.exists():
            continue
        dst_dir = world_dir / case_name
        dst_dir.mkdir(parents=True, exist_ok=True)
        planned = src_dir / "planned_path.json"
        current = src_dir / "current_planned_path.json"
        planned_out = ""
        current_out = ""
        if planned.exists():
            planned_dst = dst_dir / "planned_path.json"
            shutil.copyfile(planned, planned_dst)
            planned_out = planned_dst.relative_to(root).as_posix()
        if current.exists():
            current_dst = dst_dir / "current_planned_path.json"
            shutil.copyfile(current, current_dst)
            current_out = current_dst.relative_to(root).as_posix()
        metadata = src_dir.parent / "start_pose.json"
        if metadata.exists():
            shutil.copyfile(metadata, dst_dir / "start_pose.json")
        if planned_out or current_out:
            f.write(f"{case_name}\t{planned_out}\t{current_out}\t{rel_dir}\n")
PY

QUICK_CASES=$'replay_demo_show\nreplay_test_low_efficiency\ndebug_sh_home0_map1\nlfin1231000211_backup_map0'
DIRECTIONS=$'auto\t0\tauto\ndir0\t1\t0\ndir45\t1\t45\ndir90\t1\t90'

is_quick_case() {
  local case_name="$1"
  grep -qxF "$case_name" <<<"$QUICK_CASES"
}

manifest="$ROOT/goldens/manifest.tsv"
tmp_manifest="$manifest.tmp"
printf 'case\tstart_label\tstart_x\tstart_y\tspecify_direction\tcov_direction\tjson\tlog\n' > "$tmp_manifest"

while IFS=$'\t' read -r case_name start_label start_x start_y method; do
  [[ "$case_name" == "case" ]] && continue
  if [[ "$MODE" == "quick" ]]; then
    is_quick_case "$case_name" || continue
    [[ "$start_label" == "s0" || "$start_label" == "s1" ]] || continue
  fi

  while IFS=$'\t' read -r direction_label specify_direction cov_direction; do
    out_dir="$ROOT/goldens/grid/$case_name/$start_label"
    log_dir="$ROOT/goldens/logs/$case_name/$start_label"
    mkdir -p "$out_dir" "$log_dir"
    json_path="$out_dir/$direction_label.json"
    log_path="$log_dir/$direction_label.stderr"

    echo "gen_oracle: $case_name $start_label=($start_x,$start_y) $direction_label"
    if [[ "$specify_direction" == "0" ]]; then
      docker run --rm --platform linux/arm64 \
        -v "$ROOT/cases:/work:ro" \
        "$IMAGE" "/work/$case_name.pgm" "$start_x" "$start_y" \
        > "$json_path" 2> "$log_path"
    else
      docker run --rm --platform linux/arm64 \
        -v "$ROOT/cases:/work:ro" \
        "$IMAGE" "/work/$case_name.pgm" "$start_x" "$start_y" "$cov_direction" \
        > "$json_path" 2> "$log_path"
    fi

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$case_name" "$start_label" "$start_x" "$start_y" "$specify_direction" "$cov_direction" \
      "${json_path#$ROOT/}" "${log_path#$ROOT/}" >> "$tmp_manifest"
  done <<<"$DIRECTIONS"
done < "$ROOT/cases/starts.tsv"

mv "$tmp_manifest" "$manifest"

count="$(awk 'NR > 1 { count++ } END { print count + 0 }' "$manifest")"
echo "gen_oracle: wrote $count grid goldens ($MODE)"
