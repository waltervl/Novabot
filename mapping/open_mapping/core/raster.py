"""Occupancy-grid rasterisation (pgm) for save_map.

Header + grid sizing are byte-exact from RE of MapGenerator::saveMap
(research/documents/mower-occupancy-grid-algorithm.md §3):

  border_cells   = trunc(1.0 / 0.05) = 20     (C-style trunc toward zero)
  border_metres  = 20 * 0.05         = 1.0
  origin_x = res * trunc(xMin / res) - border_metres
  origin_y = res * trunc(yMin / res) - border_metres
  W = 2 * border_cells + firmware_round((xMax - xMin) / res)
  H = 2 * border_cells + firmware_round((yMax - yMin) / res)
  firmware_round(v) = int(v + 0.5)    [C: (int)(v + 0.5)]

Pixel fill (Task 7): FREE=254, OCCUPIED=0. Unknown/205 present in corpus pgm
edges but not in firmware's binary rasteriser — confirmed from corpus.

render_pgm() RE notes (§3 pixel fill):
  - Work polygon offset: 0.20 m via ClipperLib JT_ROUND (same params as
    expand_polygon).  Only sol[0] (main contour) is used.
  - cv2.fillPoly with lineType=4 (LINE_4) for both work fill and obstacle erase.
  - Pixel coordinate transform (C-style int() truncation, y-axis flip):
      px = int((x - origin_x) / resolution)
      py = (H-1) - int((y - origin_y) / resolution)
"""
import math
from pathlib import Path

import cv2
import numpy as np

from open_mapping.core import geometry as g

FREE, OCCUPIED, UNKNOWN = 254, 0, 205

_RESOLUTION = 0.05
_BORDER_DISTANCE = 1.0
_BORDER_CELLS = int(_BORDER_DISTANCE / _RESOLUTION)   # = 20, C trunc toward 0
_BORDER_METRES = _BORDER_CELLS * _RESOLUTION           # = 1.0

PGM_HEADER = "P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n{w} {h}\n255\n"


def _fw_round(v: float) -> int:
    """Firmware integer round: (int)(v + 0.5) — matches C cast of positive floats."""
    return int(v + 0.5)


def grid_bounds(areas: dict) -> tuple:
    """Return (xmin, ymin, xmax, ymax) over all points in all polygon lists."""
    xs = [p[0] for pts in areas.values() for p in pts]
    ys = [p[1] for pts in areas.values() for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def grid_origin(bounds: tuple, resolution: float = _RESOLUTION) -> tuple:
    """Return (origin_x, origin_y) snapped to the resolution grid minus border."""
    xmin, ymin, xmax, ymax = bounds
    bd = _BORDER_CELLS * resolution
    ox = resolution * math.trunc(xmin / resolution) - bd
    oy = resolution * math.trunc(ymin / resolution) - bd
    return (ox, oy)


def grid_size(bounds: tuple, resolution: float = _RESOLUTION) -> tuple:
    """Return (width, height) in pixels including border cells."""
    xmin, ymin, xmax, ymax = bounds
    w = 2 * _BORDER_CELLS + _fw_round((xmax - xmin) / resolution)
    h = 2 * _BORDER_CELLS + _fw_round((ymax - ymin) / resolution)
    return (w, h)


def pgm_bytes(width: int, height: int, pixels: bytes) -> bytes:
    return PGM_HEADER.format(w=width, h=height).encode("ascii") + pixels


def _pts_to_pixels(pts, origin_x, origin_y, height, resolution=_RESOLUTION):
    """Convert (x, y) metres to (px, py) integer pixel coordinates.

    Uses C-style int() truncation (toward zero) and flips the y-axis so that
    increasing y in metres maps to decreasing row index (row 0 = top of image).

    px = int((x - origin_x) / resolution)
    py = (height - 1) - int((y - origin_y) / resolution)
    """
    out = []
    for x, y in pts:
        px = int((x - origin_x) / resolution)
        py = (height - 1) - int((y - origin_y) / resolution)
        out.append([px, py])
    return out


def render_pgm(work, obstacles, bounds, resolution=_RESOLUTION):
    """Render a per-map occupancy grid (pgm pixel data) from polygon data.

    Reproduces the firmware's MapGenerator pixel-fill algorithm (RE doc §3):
      1. Allocate H×W grid, all OCCUPIED (0).
      2. Expand the work polygon by 0.20 m (ClipperLib JT_ROUND, sol[0] only).
      3. cv2.fillPoly the inflated work contour as FREE (254), lineType=4.
      4. For each obstacle polygon: cv2.fillPoly as OCCUPIED (0), lineType=4.
      5. Return raw grid bytes (row-major, uint8).

    Args:
        work:       list of (x, y) float tuples — the work-area boundary polygon
        obstacles:  list of polygon lists — each polygon is a list of (x, y) tuples
        bounds:     (xmin, ymin, xmax, ymax) bounding box for the whole map canvas
        resolution: metres per pixel (default 0.05)

    Returns:
        bytes — H*W uint8 pixel data (no PGM header; use pgm_bytes() to wrap).
    """
    from open_mapping.core.clipper import offset_meters

    w, h = grid_size(bounds, resolution)
    origin_x, origin_y = grid_origin(bounds, resolution)

    # 1. Start with all OCCUPIED
    grid = np.zeros((h, w), dtype=np.uint8)

    # 2. Expand work polygon by 0.20 m
    inflated = offset_meters(work, 0.20)
    if inflated:
        # 3. Fill inflated work area as FREE (254)
        pix = _pts_to_pixels(inflated, origin_x, origin_y, h, resolution)
        poly = np.array([pix], dtype=np.int32)
        cv2.fillPoly(grid, poly, FREE, lineType=4)

    # 4. Fill each obstacle polygon as OCCUPIED (0)
    for obs in obstacles:
        if obs:
            pix = _pts_to_pixels(obs, origin_x, origin_y, h, resolution)
            poly = np.array([pix], dtype=np.int32)
            cv2.fillPoly(grid, poly, OCCUPIED, lineType=4)

    return grid.tobytes()


def write_map_yaml(out_dir, image_name: str, origin_xy: tuple) -> None:
    p = Path(out_dir) / image_name.replace(".pgm", ".yaml")
    p.write_text(g.format_map_yaml(image_name, origin_xy))
