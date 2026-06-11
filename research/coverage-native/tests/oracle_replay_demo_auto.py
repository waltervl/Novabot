#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys


def load_json(path):
    return json.loads(pathlib.Path(path).read_text())


def main():
    if len(sys.argv) != 3:
        print("usage: oracle_replay_demo_auto.py <coverage_grid_plan> <oracle_dir>", file=sys.stderr)
        return 2

    cli = pathlib.Path(sys.argv[1])
    oracle = pathlib.Path(sys.argv[2])
    cases = [
        ("replay_demo_show", "s0", "92", "103", "auto", "auto"),
        ("replay_demo_show", "s1", "52", "55", "auto", "auto"),
        ("replay_demo_show", "s1", "52", "55", "45", "dir45"),
        ("debug_sh_home0_map1", "s0", "171", "120", "45", "dir45"),
        ("debug_sh_home0_map1", "s1", "97", "72", "45", "dir45"),
        ("lfin1231000211_backup_map0", "s0", "89", "64", "90", "dir90"),
        ("lfin1231000211_backup_map0", "s1", "54", "40", "90", "dir90"),
    ]

    for case_name, start_id, start_x, start_y, cov_dir, golden_name in cases:
        args = [str(cli), str(oracle / f"cases/{case_name}.pgm"), start_x, start_y]
        if cov_dir != "auto":
            args.append(cov_dir)
        result = subprocess.run(
            args,
            check=True,
            text=True,
            capture_output=True,
        )
        native = json.loads(result.stdout)
        golden = load_json(oracle / f"goldens/grid/{case_name}/{start_id}/{golden_name}.json")
        if native != golden:
            print(f"{case_name} {start_id}/{cov_dir} differs", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
