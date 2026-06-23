"""Tests for raster.py — pgm header + grid math.

Grid formula RE'd from MapGenerator::saveMap (mower-occupancy-grid-algorithm.md §3):
  border_cells = trunc(1.0 / 0.05) = 20 (C-style trunc toward zero)
  border_metres = 20 * 0.05 = 1.0
  W = 2*border_cells + firmware_round((xMax - xMin) / res)
  H = 2*border_cells + firmware_round((yMax - yMin) / res)
  origin_x = res * trunc(xMin / res) - border_metres  [trunc = toward 0]
  origin_y = res * trunc(yMin / res) - border_metres

Corpus cross-check: simple_map1 (and complex_map0, multimap_map2) produce 379x257
at origin (-4.75, -1.60). The test bounds below are the post-SimplifyPolygons
bounding box that the stock saveMap actually receives for that corpus group
(differs from stored csv by ~1-2 cells, per §8 of the RE doc).
"""
from open_mapping.core import raster


def test_pgm_header_exact():
    body = bytes([254, 0, 205])
    out = raster.pgm_bytes(379, 257, body)
    assert out.startswith(b"P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n379 257\n255\n")
    assert out.endswith(body)


def test_grid_size_corpus():
    # Bounds that produce the corpus-exact 379x257 + origin (-4.75, -1.60).
    # xMin=-3.75: trunc(-75.0)*0.05 - 1.0 = -3.75 - 1.0 = -4.75 ✓
    # yMin=-0.63: trunc(-12.6)*0.05 - 1.0 = -0.60 - 1.0 = -1.60 ✓
    # W=40+c_round(16.95/0.05)=40+339=379, H=40+c_round(10.85/0.05)=40+217=257
    bounds = (-3.75, -0.63, 13.20, 10.22)
    w, h = raster.grid_size(bounds)
    assert (w, h) == (379, 257)


def test_grid_origin_corpus():
    bounds = (-3.75, -0.63, 13.20, 10.22)
    ox, oy = raster.grid_origin(bounds)
    assert abs(ox - (-4.75)) < 1e-9
    assert abs(oy - (-1.60)) < 1e-9


def test_grid_size_alain_csv():
    # Cross-check against Alain's mower csv_file bounds (from RE doc §8).
    # csv xMin=-20.31, xMax=4.73, yMin=-19.79, yMax=0.49 -> 541x446 at -21.30,-20.75
    bounds = (-20.31, -19.79, 4.73, 0.49)
    w, h = raster.grid_size(bounds)
    assert (w, h) == (541, 446)
    ox, oy = raster.grid_origin(bounds)
    assert abs(ox - (-21.30)) < 1e-9
    assert abs(oy - (-20.75)) < 1e-9


def test_grid_bounds_simple():
    areas = {
        "work": [(1.0, 2.0), (5.0, 2.0), (5.0, 8.0), (1.0, 8.0)],
        "unicom": [(2.0, 0.5), (3.0, 0.5)],
    }
    xmin, ymin, xmax, ymax = raster.grid_bounds(areas)
    assert xmin == 1.0
    assert ymin == 0.5
    assert xmax == 5.0
    assert ymax == 8.0
