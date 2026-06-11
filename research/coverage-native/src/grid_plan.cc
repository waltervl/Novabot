#include "coverage_native/grid_plan.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

#include <CGAL/number_utils.h>

#include "coverage_native/contour_bridge.h"
#include "coverage_native/preprocess.h"
#include "polygon_coverage_geometry/cgal_comm.h"

namespace coverage_native {
namespace {

GridPoint pointToGridPoint(const Point_2& point) {
  return {
      static_cast<int>(CGAL::to_double(point.x())),
      static_cast<int>(CGAL::to_double(point.y())),
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

bool contourWithinSafeBorder(const GridContour& contour, int cols, int rows) {
  for (const cv::Point& point : contour.points) {
    if ((cols - 4) < point.x || point.x < 3 ||
        (rows - 4) < point.y || point.y < 3) {
      return false;
    }
  }
  return true;
}

std::vector<GridContour> safeContourFamilyForTopLevel(
    const std::vector<GridContour>& contours, std::size_t top_level_position,
    int cols, int rows) {
  std::vector<GridContour> family =
      contourFamilyForTopLevel(contours, top_level_position);
  if (family.empty() || !contourWithinSafeBorder(family.front(), cols, rows)) {
    return {};
  }

  std::vector<GridContour> safe_family;
  safe_family.push_back(family.front());
  for (std::size_t i = 1; i < family.size(); ++i) {
    if (contourWithinSafeBorder(family[i], cols, rows)) {
      safe_family.push_back(family[i]);
    }
  }
  return safe_family;
}

void appendDecompositionPlan(const DecompositionResult& decomposition,
                             const std::vector<std::vector<Point_2>>& sweeps,
                             GridPoint& current, int& output_cell_index,
                             CellPathMap& plan) {
  std::vector<CellNode> nodes =
      calculateDecompositionAdjacency(decomposition.cells);
  int start_cell = getCellIndexOfPoint(decomposition.cells, current);
  if (start_cell < 0) {
    start_cell = 0;
  }

  const std::vector<int> travelling_path =
      getTravellingPath(nodes, start_cell);
  std::vector<bool> emitted(decomposition.cells.size(), false);

  for (const int cell_index : travelling_path) {
    if (cell_index < 0 ||
        cell_index >= static_cast<int>(decomposition.cells.size())) {
      continue;
    }
    const std::size_t position = static_cast<std::size_t>(cell_index);
    if (emitted[position]) {
      continue;
    }
    emitted[position] = true;

    std::vector<Point_2> sweep = sweeps[position];
    if (shouldReverseNextSweep(Point_2(current.x, current.y), sweep)) {
      std::reverse(sweep.begin(), sweep.end());
    }

    GridPath path = pointsToGridPath(sweep);
    if (!path.empty()) {
      current = path.back();
    }
    plan.emplace(output_cell_index++, std::move(path));
  }
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

  CellPathMap plan;
  GridPoint current = start;
  int output_cell_index = 0;
  for (const std::size_t top_level_position :
       topLevelContourPositionsByDescendingArea(contours)) {
    const std::vector<GridContour> family = safeContourFamilyForTopLevel(
        contours, top_level_position, preprocessed.cols, preprocessed.rows);
    if (family.empty()) {
      continue;
    }

    const PolygonWithHoles polygon = contoursToPolygonWithHoles(family);
    const DecompositionResult decomposition =
        decomposeCoveragePolygonWithDirection(polygon, options.decomposition);
    const std::vector<std::vector<Point_2>> sweeps =
        computeVendorSweepsForCells(decomposition,
                                    options.parameters.coverage_length_px,
                                    options.decomposition);
    appendDecompositionPlan(decomposition, sweeps, current, output_cell_index,
                            plan);
  }

  if (plan.empty()) {
    throw std::runtime_error("coverage map produced no safe contours");
  }
  return plan;
}

}  // namespace coverage_native
