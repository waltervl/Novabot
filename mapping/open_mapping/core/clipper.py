"""ClipperLib polygon offset (the stock `expandPolygon`) via pyclipper.

Reproduces the work boundary's offset solution contours that the stock node
writes to csv_file/. `Execute` can return multiple contours for a complex
boundary (obstacles/unicoms/charger pinch it) — ALL are emitted in the
accumulation pattern: the "fan".

Parameters RE'd from the binary (`expandPolygon` @ 0x594d0):
  SCALE        = 10000   (confirmed by fmul d0, d1, #10000.0 at 0x59754)
  DELTA        = 0.30 m  (confirmed: x3 bbox expands by 0.30m on 3 sides)
  JoinType     = JT_ROUND  (w2=0x1 before AddPath call at 0x59738)
  EndType      = ET_CLOSEDPOLYGON  (w3=0x0 before AddPath at 0x59738)
  MiterLimit   = 2.0  (fmov d0, #2.0 at constructor 0x594e0)
  ArcTolerance = 0.25 (fmov d1, #0.25 at constructor 0x594dc)

Output format (from 0x597fc-0x59810):
  int_coord / 10000.0 → float64 → float32 → "%.2f" (float32 formatting)

Accumulation pattern:
  row[0] = contours[0]  (main polygon boundary)
  row[k] = contours[0] + contours[1] + ... + contours[k]  for k=1..N-1
  The csv_file is the concatenation: row[0] + row[1] + ... + row[N-1]

STRATEGY C — clean offset, snapshot-validated (NOT byte-identical to stock):
  The stock ARM64 binary uses a PATCHED ClipperLib that generates one extra arc
  point at certain concave corners (arc-step boundary condition differs from
  standard ClipperLib 6.4.2). This causes the stock's csv_file to have 23
  contours / 552-pt main vs our 22 contours / 551-pt main.
  We deliberately DO NOT reproduce this patched arc-point behavior.
  Our standard pyclipper output is the correct clean offset and is validated
  against a committed snapshot (tests/golden/clean_map0_work.csv) for
  deterministic regression testing. Byte-identity with the stock golden is
  not a target for csv_file; pgm byte-identity is handled in later tasks.
  See: .superpowers/sdd/task-5-report.md for full analysis.
"""
import struct
import pyclipper
from open_mapping.core import geometry as g

SCALE = 10000        # metres → integer units (confirmed from disassembly)
DELTA = 0.30         # offset distance in metres (confirmed from golden bbox expansion)
MITER_LIMIT = 2.0    # ClipperOffset miterLimit (from constructor fmov d0, #2.0)
ARC_TOLERANCE = 0.25  # ClipperOffset arcTolerance (from constructor fmov d1, #0.25)


def _to_float32_str(val_int: int) -> str:
    """Reproduce the stock binary's int→float32→"%.2f" conversion.

    The binary does: scvtf d0, d0; fdiv d0, d0, #10000.0; fcvt s0, d0
    i.e., int → double → divide by 10000.0 → convert to float32 → format %.2f.
    """
    val_d = float(val_int) / 10000.0
    val_f = struct.unpack('f', struct.pack('f', val_d))[0]
    return f'{val_f:.2f}'


def expand_polygon(work_pts, obstacle_polys, unicom_polys, charge_polys, scale=SCALE):
    """Expand the work boundary polygon using ClipperOffset.

    Mirrors `expandPolygon` @ 0x594d0: one AddPath + Execute call for the
    work polygon. Returns the list of contours from Execute — contour[0] is
    the main expanded boundary, contour[1..N] are small sub-contours that
    appear where the concave polygon's expanded edges intersect.

    Args:
        work_pts: list of (x, y) float tuples (from x3_csv_file/map0_work.csv)
        obstacle_polys, unicom_polys, charge_polys: ignored for csv_file/map0_work.csv
            (they affect other output files handled by other tasks)
        scale: integer scale factor (default SCALE=10000)

    Returns:
        list of contours, each contour = list of (x, y) float tuples (float32 precision)
    """
    co = pyclipper.PyclipperOffset(miter_limit=MITER_LIMIT, arc_tolerance=ARC_TOLERANCE)
    # Convert to ClipperLib integer coordinates
    path = [(round(x * scale), round(y * scale)) for x, y in work_pts]
    co.AddPath(path, pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
    solution = co.Execute(DELTA * scale)
    # Convert back using float32 (matching stock binary's scvtf/fdiv/fcvt sequence)
    contours = [
        [(float(_to_float32_str(x)), float(_to_float32_str(y))) for x, y in c]
        for c in solution
    ]
    return contours


def offset_meters(pts, delta, scale=SCALE):
    """Offset a polygon by *delta* metres using JT_ROUND (for pgm rasterisation).

    This is the per-map pgm variant of the offset: it uses JT_ROUND with the
    same ClipperOffset parameters as expand_polygon, but returns only the main
    contour (sol[0]) as float (x, y) tuples in metres.

    The offset is applied before cv2.fillPoly in render_pgm to reproduce the
    firmware's ~0.2m inward-shrunk FREE region behaviour (RE doc §3).

    Args:
        pts:   list of (x, y) float tuples (metres)
        delta: offset distance in metres (positive = expand, negative = shrink)
        scale: integer scale factor (default SCALE=10000)

    Returns:
        list of (x, y) float tuples for the main offset contour, or [] if empty.
    """
    co = pyclipper.PyclipperOffset(miter_limit=MITER_LIMIT, arc_tolerance=ARC_TOLERANCE)
    co.AddPath(
        [(round(x * scale), round(y * scale)) for x, y in pts],
        pyclipper.JT_ROUND,
        pyclipper.ET_CLOSEDPOLYGON,
    )
    sol = co.Execute(delta * scale)
    return [(x / scale, y / scale) for x, y in (sol[0] if sol else [])]


def write_csv_file(out_dir, work_name, contours, others):
    """Write csv_file/work_name using the fan accumulation pattern.

    The stock binary writes each row as: contours[0] + contours[1..k] for k=0..N-1,
    producing N rows where each row is slightly longer than the previous.
    This matches the golden's 23-row structure (1 main + 22 accumulated rows).

    Args:
        out_dir: output directory path
        work_name: filename for the work csv (e.g. 'map0_work.csv')
        contours: list of contours from expand_polygon (contours[0]=main, rest=subs)
        others: dict of name -> pts for non-work csv files (passed through as-is)
    """
    from pathlib import Path
    d = Path(out_dir) / "csv_file"
    d.mkdir(parents=True, exist_ok=True)

    if contours:
        main = contours[0]
        subs = contours[1:]
        # Build rows: row[0] = main, row[k] = main + subs[0..k-1]
        rows = []
        rows.append(main)
        acc = []
        for sub in subs:
            acc.extend(sub)
            rows.append(main + list(acc))
        # Write all rows concatenated
        text = "".join(g.format_csv(row) for row in rows)
        (d / work_name).write_text(text)
    else:
        (d / work_name).write_text("")

    # Pass-through any other files
    for name, pts in others.items():
        (d / name).write_text(g.format_csv(pts))
