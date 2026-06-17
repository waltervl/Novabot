#!/usr/bin/env python3
"""unicom_mirror.py - mirror the full channel path from x3_csv_file into csv_file.

Why this exists
---------------
The stock mapping node (`saveScanData`, novabot_mapping.cpp) writes a map<->map
channel's `csv_file/<...>_unicom.csv` as ONLY the recorded points that fall
OUTSIDE every work-area polygon (`cv::pointPolygonTest(area, point, false) < 0`).
For adjacent or overlapping zones that set is empty, so the channel's csv_file
ends up 0 bytes. The full driven path is always written to `x3_csv_file/<same>`.

The server only ingests `csv_file` (parseMapZip skips empty CSVs), so an empty
channel csv never reaches the DB/app AND the per-map pgm corridor is not carved
-> the mower cannot path between the two zones (returns to dock instead of
mowing the far zone).

This daemon keeps `csv_file/<...>tomap<...>_unicom.csv` equal to its
`x3_csv_file` counterpart (the full path), so the channel survives the normal
upload -> parseMapZip -> DB flow and the corridor is carved. Only map<->map
channels (filename contains "tomap") are mirrored; the dock route
(`*tocharge*`) is left untouched.

Idempotent: copies only when the two files differ, writes atomically (tmp +
os.replace) so an in-flight upload never reads a half-written file. The first
loop iteration acts as a boot-time backfill for existing maps.

Full reverse-engineering + evidence: research/documents/unicom-csv-outside-filter.md
"""
import os
import glob
import shutil
import filecmp
import time

MAPS_GLOB = "/userdata/lfi/maps/home*/x3_csv_file"
PATTERN = "*tomap*_unicom.csv"   # map<->map channels only; never *tocharge*
POLL_SEC = 1.0


def mirror_once():
    copied = 0
    for x3dir in glob.glob(MAPS_GLOB):
        csvdir = os.path.join(os.path.dirname(x3dir), "csv_file")
        if not os.path.isdir(csvdir):
            continue
        for x3 in glob.glob(os.path.join(x3dir, PATTERN)):
            try:
                if os.path.getsize(x3) == 0:
                    continue  # nothing recorded yet
                dst = os.path.join(csvdir, os.path.basename(x3))
                if os.path.exists(dst) and filecmp.cmp(x3, dst, shallow=False):
                    continue  # already identical -> no churn
                tmp = dst + ".mirror.tmp"
                shutil.copyfile(x3, tmp)
                os.replace(tmp, dst)  # atomic
                print("[unicom_mirror] %s -> csv_file (%d bytes)"
                      % (os.path.basename(x3), os.path.getsize(dst)), flush=True)
                copied += 1
            except OSError as e:
                print("[unicom_mirror] %s: %s" % (x3, e), flush=True)
    return copied


def main():
    print("[unicom_mirror] started (glob=%s pattern=%s poll=%ss)"
          % (MAPS_GLOB, PATTERN, POLL_SEC), flush=True)
    while True:
        try:
            mirror_once()
        except Exception as e:  # never let the loop die
            print("[unicom_mirror] loop error: %s" % e, flush=True)
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
