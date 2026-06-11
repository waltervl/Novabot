#include "coverage_native/grid_plan.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

#include <CGAL/number_utils.h>

#include "coverage_native/contour_bridge.h"
#include "coverage_native/preprocess.h"
#include "polygon_coverage_geometry/cgal_comm.h"

namespace coverage_native {
namespace {

GridPoint pointToGridPoint(const Point_2& point) {
  return {
      static_cast<int>(std::lround(CGAL::to_double(point.x()))),
      static_cast<int>(std::lround(CGAL::to_double(point.y()))),
  };
}

GridPath pointsToGridPath(const std::vector<Point_2>& points) {
  GridPath path;
  path.reserve(points.size());
  for (const Point_2& point : points) {
    path.push_back(pointToGridPoint(point));
  }
  return path;
}

double squaredDistance(const GridPoint& a, const GridPoint& b) {
  const double dx = static_cast<double>(a.x - b.x);
  const double dy = static_cast<double>(a.y - b.y);
  return dx * dx + dy * dy;
}

std::vector<std::size_t> cellsByDescendingArea(
    const std::vector<Polygon_2>& cells) {
  std::vector<std::size_t> positions(cells.size());
  std::iota(positions.begin(), positions.end(), 0);
  std::sort(positions.begin(), positions.end(),
            [&cells](std::size_t a, std::size_t b) {
              return std::abs(CGAL::to_double(cells[a].area())) >
                     std::abs(CGAL::to_double(cells[b].area()));
            });
  return positions;
}

GridPath orientPathFromCurrent(GridPath path, const GridPoint& current) {
  if (path.size() < 2) {
    return path;
  }

  const double front_distance = squaredDistance(current, path.front());
  const double back_distance = squaredDistance(current, path.back());
  if (back_distance < front_distance) {
    std::reverse(path.begin(), path.end());
  }
  return path;
}

}  // namespace

CellPathMap generateCoverageGridPlan(const cv::Mat& map,
                                     const GridPoint& start,
                                     const GridPlanOptions& options) {
  const cv::Mat preprocessed =
      preprocessObstacleMap(map, options.parameters);
  const std::vector<GridContour> contours = findCoverageContours(preprocessed);
  if (contours.empty()) {
    throw std::runtime_error("coverage map produced no contours");
  }

  const PolygonWithHoles polygon = contoursToPolygonWithHoles(contours);
  const DecompositionResult decomposition =
      decomposeCoveragePolygonWithDirection(polygon, options.decomposition);
  const std::vector<std::vector<Point_2>> sweeps =
      computeVendorSweepsForCells(decomposition,
                                  options.parameters.coverage_length_px,
                                  options.decomposition);

  CellPathMap plan;
  GridPoint current = start;
  int output_cell_index = 0;
  for (const std::size_t cell_index : cellsByDescendingArea(decomposition.cells)) {
    GridPath path = orientPathFromCurrent(pointsToGridPath(sweeps[cell_index]),
                                          current);
    if (!path.empty()) {
      current = path.back();
    }
    plan.emplace(output_cell_index++, std::move(path));
  }
  return plan;
}

}  // namespace coverage_native
