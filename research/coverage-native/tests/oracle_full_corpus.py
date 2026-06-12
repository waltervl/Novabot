#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys


def load_json(path):
    return json.loads(pathlib.Path(path).read_text())


def iter_manifest_rows(manifest_path):
    for line in pathlib.Path(manifest_path).read_text().splitlines():
        if not line or line.startswith("#") or line.startswith("case\t"):
            continue
        fields = line.split("\t")
        if len(fields) < 8:
            raise ValueError(f"manifest row has {len(fields)} fields: {line}")
        yield fields[:8]


def main():
    if len(sys.argv) != 3:
        print(
            "usage: oracle_full_corpus.py <coverage_grid_plan> <oracle_dir>",
            file=sys.stderr,
        )
        return 2

    cli = pathlib.Path(sys.argv[1])
    oracle = pathlib.Path(sys.argv[2])
    manifest = oracle / "goldens/manifest.tsv"

    total = 0
    exact = 0
    failures = []
    for (
        case_name,
        start_id,
        start_x,
        start_y,
        specify,
        cov_dir,
        golden_name,
        _log,
    ) in iter_manifest_rows(manifest):
        args = [str(cli), str(oracle / f"cases/{case_name}.pgm"), start_x, start_y]
        if specify == "1":
            args.append(cov_dir)

        total += 1
        result = subprocess.run(args, text=True, capture_output=True)
        if result.returncode != 0:
            failures.append(
                f"{case_name} {start_id}/{cov_dir} exited {result.returncode}: "
                f"{result.stderr.strip()}"
            )
            continue

        native = json.loads(result.stdout)
        golden = load_json(oracle / golden_name)
        if native == golden:
            exact += 1
        else:
            failures.append(f"{case_name} {start_id}/{cov_dir} differs")

    exited = sum(" exited " in failure for failure in failures)
    print(f"exact={exact}/{total} ran={total - exited}")
    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
