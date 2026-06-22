"""Run a core file-transform on a fixture's input and byte-diff its output
against the frozen golden output. The oracle for byte-identical parity."""
import json
import tarfile
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FileDiff:
    name: str
    status: str   # "match" | "differ" | "missing" | "extra"
    detail: str = ""


@dataclass
class DiffReport:
    files: list = field(default_factory=list)

    @property
    def all_match(self):
        return bool(self.files) and all(f.status == "match" for f in self.files)


def _extract(tar_path: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "r") as t:
        t.extractall(dest)


def _rel_files(root: Path):
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


def run_fixture(fixture_dir: Path, core_fn) -> DiffReport:
    """Load fixture_dir/input, run core_fn, byte-diff against fixture_dir/golden."""
    fixture_dir = Path(fixture_dir)
    request = json.loads((fixture_dir / "input" / "request.json").read_text())
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        in_dir = tmp / "in"
        out_dir = tmp / "out"
        golden_dir = tmp / "golden"
        out_dir.mkdir()
        _extract(fixture_dir / "input" / "mapdir_before.tar", in_dir)
        _extract(fixture_dir / "golden" / "mapdir_after.tar", golden_dir)

        core_fn(in_dir, request, out_dir)

        golden_files = _rel_files(golden_dir)
        out_files = _rel_files(out_dir)
        report = DiffReport()
        for name in sorted(golden_files | out_files):
            g = golden_dir / name
            o = out_dir / name
            if name not in out_files:
                report.files.append(FileDiff(name, "missing", "core produced no such file"))
            elif name not in golden_files:
                report.files.append(FileDiff(name, "extra", "core produced an unexpected file"))
            elif g.read_bytes() == o.read_bytes():
                report.files.append(FileDiff(name, "match"))
            else:
                report.files.append(FileDiff(name, "differ", f"{len(g.read_bytes())} vs {len(o.read_bytes())} bytes"))
        return report
