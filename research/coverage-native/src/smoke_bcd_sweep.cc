#include <cstddef>
#include <iostream>
#include <vector>

#include <CGAL/number_utils.h>
#include <opencv2/core/version.hpp>

#include "polygon_coverage_geometry/cgal_comm.h"
#include "polygon_coverage_geometry/decomposition.h"
#include "polygon_coverage_geometry/sweep.h"

namespace pcp = polygon_coverage_planning;

namespace {

Polygon_2 makeLawnPolygon() {
  Polygon_2 polygon;
  polygon.push_back(Point_2(0, 0));
  polygon.push_back(Point_2(12, 0));
  polygon.push_back(Point_2(12, 4));
  polygon.push_back(Point_2(4, 4));
  polygon.push_back(Point_2(4, 12));
  polygon.push_back(Point_2(0, 12));

  if (polygon.is_clockwise_oriented()) {
    polygon.reverse_orientation();
  }
  return polygon;
}

}  // namespace

int main() {
  PolygonWithHoles pwh(makeLawnPolygon());
  pcp::sortVertices(&pwh);

  std::vector<Polygon_2> cells;
  if (!pcp::computeBestBCDFromPolygonWithHoles(pwh, &cells) ||
      cells.empty()) {
    std::cerr << "computeBestBCDFromPolygonWithHoles returned no cells\n";
    return 1;
  }

  std::size_t total_sweep_sets = 0;
  std::size_t total_waypoints = 0;
  for (const Polygon_2& cell : cells) {
    std::vector<std::vector<Point_2>> sweeps;
    if (!pcp::computeAllSweeps(cell, 3.0, &sweeps) || sweeps.empty()) {
      std::cerr << "computeAllSweeps returned no sweeps\n";
      return 1;
    }

    total_sweep_sets += sweeps.size();
    for (const auto& sweep : sweeps) {
      total_waypoints += sweep.size();
    }
  }

  std::cout << "opencv=" << CV_VERSION << "\n";
  std::cout << "cells=" << cells.size() << "\n";
  std::cout << "sweep_sets=" << total_sweep_sets << "\n";
  std::cout << "waypoints=" << total_waypoints << "\n";
  std::cout << "area=" << CGAL::to_double(pcp::computeArea(pwh)) << "\n";
  return 0;
}
