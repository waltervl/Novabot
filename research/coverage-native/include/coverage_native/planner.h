#pragma once

#include <vector>

#include "polygon_coverage_geometry/cgal_definitions.h"

namespace coverage_native {

struct DecompositionOptions {
  bool specify_direction = false;
  unsigned char coverage_direction_degrees = 0;
};

std::vector<Polygon_2> decomposeCoveragePolygon(
    const PolygonWithHoles& polygon, const DecompositionOptions& options);

std::vector<std::vector<std::vector<Point_2>>> computeSweepsForCells(
    const std::vector<Polygon_2>& cells, double coverage_length_px);

}  // namespace coverage_native
