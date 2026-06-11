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

GridPath chooseNearestSweep(const std::vector<std::vector<Point_2>>& sweeps,
                            const GridPoint& current) {
  if (sweeps.empty()) {
    throw std::invalid_argument("cannot choose from empty sweep set");
  }

  GridPath best_path = pointsToGridPath(sweeps.front());
  double best_distance = squaredDistance(current, best_path.front());

  for (std::size_t i = 1; i < sweeps.size(); ++i) {
    GridPath candidate = pointsToGridPath(sweeps[i]);
    const double distance = squaredDistance(current, candidate.front());
    if (distance < best_distance) {
      best_distance = distance;
      best_path = std::move(candidate);
    }
  }
  return best_path;
}

}  // namespace

CellPathMap generateCoverageGridPlan(const cv::Mat& map,
                                     const GridPoint& start,
                                     const GridPlanOptions& options) {
  const cv::Mat preprocessed =
      preprocessMap(map, map, options.parameters);
  const std::vector<GridContour> contours = findCoverageContours(preprocessed);
  if (contours.empty()) {
    throw std::runtime_error("coverage map produced no contours");
  }

  const PolygonWithHoles polygon = contoursToPolygonWithHoles(contours);
  const std::vector<Polygon_2> cells =
      decomposeCoveragePolygon(polygon, options.decomposition);
  const std::vector<std::vector<std::vector<Point_2>>> sweeps =
      computeSweepsForCells(cells, options.parameters.coverage_length_px);

  CellPathMap plan;
  GridPoint current = start;
  int output_cell_index = 0;
  for (const std::size_t cell_index : cellsByDescendingArea(cells)) {
    GridPath path = chooseNearestSweep(sweeps[cell_index], current);
    if (!path.empty()) {
      current = path.back();
    }
    plan.emplace(output_cell_index++, std::move(path));
  }
  return plan;
}

}  // namespace coverage_native
