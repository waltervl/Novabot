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
"""
import math
from pathlib import Path

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


def write_map_yaml(out_dir, image_name: str, origin_xy: tuple) -> None:
    p = Path(out_dir) / image_name.replace(".pgm", ".yaml")
    p.write_text(g.format_map_yaml(image_name, origin_xy))
