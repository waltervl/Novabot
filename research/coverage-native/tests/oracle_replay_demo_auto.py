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
        ("s0", "92", "103"),
        ("s1", "52", "55"),
    ]

    for start_id, start_x, start_y in cases:
        result = subprocess.run(
            [str(cli), str(oracle / "cases/replay_demo_show.pgm"), start_x, start_y],
            check=True,
            text=True,
            capture_output=True,
        )
        native = json.loads(result.stdout)
        golden = load_json(oracle / f"goldens/grid/replay_demo_show/{start_id}/auto.json")
        if native != golden:
            print(f"replay_demo_show {start_id}/auto differs", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
