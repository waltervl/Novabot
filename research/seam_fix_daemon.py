#!/usr/bin/env python3
"""seam_fix_daemon.py - keep map.pgm free of the firmware's occupied-inside-lawn seam.

Why this exists
---------------
The stock occupancy-grid writer (`MapGenerator::saveMap`, called by
`NovabotMapping::updateMonitorMapData`) renders a thin OCCUPIED stripe INSIDE the
covered work area. PROVEN on LFIN2231000633: ~490 cells are occupied in map.pgm
yet FREE in a plain polygon fill of the work CSVs (cv2.fillPoly) — i.e. the
stripe is in NO csv, the firmware draws it during grid construction. It
re-appears on EVERY map/task interaction (updateMonitorMapData re-renders), so a
one-shot fix never survives. nav2 return-home then cannot cross it and the mower
gets stuck mid-map.

The fix (structural, principled)
--------------------------------
Inside a designated work area the only OCCUPIED cells should be mapped obstacles;
any other occupied cell is a grid artefact. So: a cell that is occupied but
strictly inside a work polygon and not a mapped obstacle -> free (254).

Talud-safe by construction: only cells inside the RAW (un-inflated) work polygons
are touched. Everything outside (boundary / embankment) stays occupied, so the
mower never gains traversable space toward the talud.

After cleaning the global map.pgm it regenerates the per-slot mapN.pgm (same
masking as handle_regenerate_per_map_files) so the coverage planner inherits the
clean grid too.

Model: unicom_mirror.py — poll loop, atomic write (tmp + os.replace), idempotent
(no churn when already clean), never lets the loop die.
"""
import os
import re
import glob
import time
import ctypes
import struct
import select

POLL_SEC = 1.0               # fallback cadence when inotify is unavailable
FALLBACK_POLL_SEC = 5.0      # safety sweep cadence while inotify IS active
MIN_SWEEP_INTERVAL = 0.15    # debounce: coalesce write-bursts, bound CPU/temp
MAPS_GLOB = "/userdata/lfi/maps/home*"
OCCUPIED = 0
FREE = 254
THRESH = 128                 # pixel < THRESH == occupied
OBSTACLE_INFLATE_M = 0.10
# per-slot regenerate constants (match handle_regenerate_per_map_files)
INFLATE_M = 0.6
UNICOM_W_M = 1.4
DOCK_R_M = 0.8


def _read_csv(path):
    pts = []
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                a = line.replace(",", " ").split()
                if len(a) >= 2:
                    pts.append((float(a[0]), float(a[1])))
    except OSError:
        pass
    return pts


def _res_origin(yaml_text):
    rm = re.search(r"resolution:\s*([0-9.eE+-]+)", yaml_text)
    om = re.search(r"origin:\s*\[\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)", yaml_text)
    if not rm or not om:
        return None
    return float(rm.group(1)), float(om.group(1)), float(om.group(2))


def fix_one(base, np, Image, ImageDraw):
    whole_pgm = f"{base}/map.pgm"
    whole_yaml = f"{base}/map.yaml"
    csv_dir = f"{base}/csv_file"
    if not (os.path.exists(whole_pgm) and os.path.exists(whole_yaml) and os.path.isdir(csv_dir)):
        return 0
    ro = _res_origin(open(whole_yaml).read())
    if not ro:
        return 0
    res, ox, oy = ro
    arr = np.array(Image.open(whole_pgm).convert("L"), dtype=np.uint8)
    H, W = arr.shape

    def to_px(x, y):
        return (int((x - ox) / res), (H - 1) - int((y - oy) / res))

    # raw work-polygon union (NO inflate -> strictly interior, talud-safe)
    lawn_img = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(lawn_img)
    n_work = 0
    for fname in sorted(os.listdir(csv_dir)):
        if re.match(r"^map\d+_work\.csv$", fname):
            p = _read_csv(f"{csv_dir}/{fname}")
            if len(p) >= 3:
                ld.polygon([to_px(x, y) for (x, y) in p], fill=255)
                n_work += 1
    if n_work == 0:
        return 0
    lawn = np.array(lawn_img) > 0

    # mapped obstacles (+ min thickness) MUST stay occupied
    obst_img = Image.new("L", (W, H), 0)
    od = ImageDraw.Draw(obst_img)
    ow = max(1, 2 * int(round(OBSTACLE_INFLATE_M / res)))
    for fname in os.listdir(csv_dir):
        if re.match(r"^map\d+_\d+_obstacle\.csv$", fname):
            op = [to_px(x, y) for (x, y) in _read_csv(f"{csv_dir}/{fname}")]
            if len(op) >= 3:
                od.polygon(op, fill=255, outline=255)
                od.line(op + [op[0]], fill=255, width=ow, joint="curve")
    obst = np.array(obst_img) > 0

    fix = (arr < THRESH) & lawn & (~obst)
    freed = int(fix.sum())
    if freed == 0:
        return 0  # already clean -> no churn

    arr[fix] = np.uint8(FREE)
    tmp = whole_pgm + ".seamtmp"
    with open(tmp, "wb") as fh:
        fh.write(f"P5\n# CREATOR: map_generator.cpp {res:.3f} m/pix\n{W} {H}\n255\n".encode("ascii"))
        fh.write(arr.tobytes())
    os.replace(tmp, whole_pgm)
    try:
        Image.fromarray(arr, mode="L").save(f"{base}/map.png")
    except Exception:
        pass

    _regenerate_per_slot(base, res, ox, oy, arr, csv_dir, np, Image, ImageDraw)
    print("[seam_fix] %s: freed %d occupied cell(s) inside %d work polygon(s)"
          % (base, freed, n_work), flush=True)
    return freed


def _regenerate_per_slot(base, res, ox, oy, whole, csv_dir, np, Image, ImageDraw):
    H, W = whole.shape

    def to_px(x, y):
        return (int((x - ox) / res), (H - 1) - int((y - oy) / res))

    slots, unicom_files, obstacle_files = [], [], []
    for f in os.listdir(csv_dir):
        m = re.match(r"^(map\d+)_work\.csv$", f)
        if m:
            slots.append(m.group(1))
        if f.endswith("_unicom.csv"):
            unicom_files.append(f)
        if re.match(r"^map\d+_\d+_obstacle\.csv$", f):
            obstacle_files.append(f)
    dock = None
    cs = f"{base}/charging_station_file/charging_station.yaml"
    if os.path.exists(cs):
        cm = re.search(r"charging_pose:\s*\[\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)", open(cs).read())
        if cm:
            dock = to_px(float(cm.group(1)), float(cm.group(2)))
    infl = max(1, int(round(INFLATE_M / res)))
    uw = max(2, int(round(UNICOM_W_M / res)))
    dr = max(2, int(round(DOCK_R_M / res)))
    ow = max(1, 2 * int(round(OBSTACLE_INFLATE_M / res)))
    whole_yaml_content = open(f"{base}/map.yaml").read()
    for slot in sorted(slots):
        wp = _read_csv(f"{csv_dir}/{slot}_work.csv")
        if len(wp) < 3:
            continue
        mask = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(mask)
        poly = [to_px(x, y) for (x, y) in wp]
        d.polygon(poly, fill=255)
        d.line(poly + [poly[0]], fill=255, width=2 * infl, joint="curve")
        for uf in unicom_files:
            mm = re.match(r"^(map\d+)to(map\d+|charge)", uf)
            if mm and (mm.group(1) == slot or mm.group(2) == slot):
                up = [to_px(x, y) for (x, y) in _read_csv(f"{csv_dir}/{uf}")]
                if len(up) >= 2:
                    d.line(up, fill=255, width=uw, joint="curve")
        if dock is not None:
            d.ellipse([dock[0] - dr, dock[1] - dr, dock[0] + dr, dock[1] + dr], fill=255)
        out = np.where(np.array(mask, dtype=np.uint8) > 0, whole, np.uint8(OCCUPIED)).astype(np.uint8)
        om = Image.new("L", (W, H), 0)
        oD = ImageDraw.Draw(om)
        for of in obstacle_files:
            if re.match("^" + slot + r"_\d+_obstacle\.csv$", of):
                op = [to_px(x, y) for (x, y) in _read_csv(f"{csv_dir}/{of}")]
                if len(op) >= 3:
                    oD.polygon(op, fill=255, outline=255)
                    oD.line(op + [op[0]], fill=255, width=ow, joint="curve")
        out = np.where(np.array(om, dtype=np.uint8) > 0, np.uint8(OCCUPIED), out).astype(np.uint8)
        tmp = f"{base}/{slot}.pgm.seamtmp"
        with open(tmp, "wb") as fh:
            fh.write(f"P5\n# CREATOR: map_generator.cpp {res:.3f} m/pix\n{W} {H}\n255\n".encode("ascii"))
            fh.write(out.tobytes())
        os.replace(tmp, f"{base}/{slot}.pgm")
        try:
            Image.fromarray(out, mode="L").save(f"{base}/{slot}.png")
        except Exception:
            pass


_IN_CLOSE_WRITE = 0x00000008
_IN_MOVED_TO = 0x00000080
_IN_CREATE = 0x00000100
_IN_NONBLOCK = 0x800


class _InotifyWatch:
    """Dependency-free inotify (ctypes) on the map home dirs. Fires the moment
    the firmware (re)writes map.pgm, so the seam is cleaned within milliseconds
    instead of up to a poll-interval later — closing the race where nav2 reads a
    transient striped global. Construction raises if inotify is unavailable; the
    caller then falls back to plain polling."""

    def __init__(self, dirs):
        self._libc = ctypes.CDLL("libc.so.6", use_errno=True)
        self.fd = self._libc.inotify_init1(_IN_NONBLOCK)
        if self.fd < 0:
            raise OSError("inotify_init1 failed (errno %d)" % ctypes.get_errno())
        self._mask = _IN_CLOSE_WRITE | _IN_MOVED_TO | _IN_CREATE
        self.watched = set()
        self.add(dirs)

    def add(self, dirs):
        for d in dirs:
            if d in self.watched:
                continue
            if self._libc.inotify_add_watch(self.fd, d.encode(), self._mask) >= 0:
                self.watched.add(d)

    def wait(self, timeout):
        """Block up to `timeout`s; return True iff map.pgm changed. Drains the
        whole queue so a burst collapses into one sweep."""
        try:
            r, _, _ = select.select([self.fd], [], [], timeout)
        except Exception:
            return False
        if not r:
            return False
        try:
            data = os.read(self.fd, 8192)
        except OSError:
            return False
        hit = False
        i = 0
        while i + 16 <= len(data):
            _wd, _m, _ck, nlen = struct.unpack_from("iIII", data, i)
            i += 16
            name = data[i:i + nlen].split(b"\0", 1)[0].decode("utf-8", "replace")
            i += nlen
            if name == "map.pgm":
                hit = True
        return hit


def main():
    try:
        import numpy as np
        from PIL import Image, ImageDraw
    except Exception as e:
        print("[seam_fix] numpy/PIL import failed: %s" % e, flush=True)
        return

    def sweep():
        total = 0
        for base in glob.glob(MAPS_GLOB):
            try:
                total += fix_one(base, np, Image, ImageDraw)
            except Exception as e:
                print("[seam_fix] %s: %s" % (base, e), flush=True)
        return total

    ino = None
    try:
        ino = _InotifyWatch(sorted(glob.glob(MAPS_GLOB)))
        print("[seam_fix] started (inotify, fallback=%ss)" % FALLBACK_POLL_SEC, flush=True)
        _heartbeat("started mode=inotify")
    except Exception as e:
        print("[seam_fix] inotify unavailable (%s) -> poll mode %ss" % (e, POLL_SEC), flush=True)
        _heartbeat("started mode=poll")

    sweep()  # clean once at startup
    it = 0
    last_sweep = 0.0
    while True:
        it += 1
        try:
            if ino is not None:
                hit = ino.wait(FALLBACK_POLL_SEC)
                reason = "event" if hit else "fallback"
                ino.add(sorted(glob.glob(MAPS_GLOB)))  # pick up newly-created home dirs
                if hit:
                    dt = time.monotonic() - last_sweep
                    if dt < MIN_SWEEP_INTERVAL:
                        time.sleep(MIN_SWEEP_INTERVAL - dt)  # coalesce write-burst
            else:
                reason = "poll"
                time.sleep(POLL_SEC)
            total = sweep()
            last_sweep = time.monotonic()
        except Exception as e:
            print("[seam_fix] loop error: %s" % e, flush=True)
            _heartbeat("looperr iter=%d %s" % (it, e))
            time.sleep(POLL_SEC)
            continue
        _heartbeat("iter=%d %s last_freed=%d" % (it, reason, total))


def _heartbeat(msg):
    try:
        with open("/tmp/seam_fix.status", "w") as fh:
            fh.write(msg + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    main()
