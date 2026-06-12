#include "coverage_native/grid_plan.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

#include <CGAL/squared_distance_2.h>
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

constexpr double kRepeatEndpointDistanceThreshold = 0.2;

bool isTinyEndpointSegment(const Point_2& endpoint, const Point_2& neighbor) {
  return CGAL::to_double(CGAL::squared_distance(endpoint, neighbor)) <
         kRepeatEndpointDistanceThreshold;
}

bool pointOnCollinearSegment(const Point_2& point, const Point_2& segment_a,
                             const Point_2& segment_b) {
  return CGAL::collinear(segment_a, segment_b, point) &&
         CGAL::collinear_are_ordered_along_line(segment_a, point, segment_b);
}

bool segmentsOverlapOnLine(const Point_2& a0, const Point_2& a1,
                           const Point_2& b0, const Point_2& b1) {
  const double dx = std::fabs(CGAL::to_double(a1.x() - a0.x()));
  const double dy = std::fabs(CGAL::to_double(a1.y() - a0.y()));
  const bool use_x = dx >= dy;

  const double a_start = use_x ? CGAL::to_double(a0.x())
                               : CGAL::to_double(a0.y());
  const double a_end =
      use_x ? CGAL::to_double(a1.x()) : CGAL::to_double(a1.y());
  const double b_start = use_x ? CGAL::to_double(b0.x())
                               : CGAL::to_double(b0.y());
  const double b_end =
      use_x ? CGAL::to_double(b1.x()) : CGAL::to_double(b1.y());

  const double overlap_start =
      std::max(std::min(a_start, a_end), std::min(b_start, b_end));
  const double overlap_end =
      std::min(std::max(a_start, a_end), std::max(b_start, b_end));
  return (overlap_end - overlap_start) > 1e-9;
}

bool segmentContainsSegment(const Point_2& container_a,
                            const Point_2& container_b,
                            const Point_2& candidate_a,
                            const Point_2& candidate_b) {
  return pointOnCollinearSegment(candidate_a, container_a, container_b) &&
         pointOnCollinearSegment(candidate_b, container_a, container_b);
}

bool eraseCurrentRepeatPoint(std::vector<Point_2>& sweep, bool head) {
  if (sweep.empty()) {
    return false;
  }
  if (head) {
    sweep.erase(sweep.begin());
  } else {
    sweep.pop_back();
  }
  return true;
}

bool eraseOtherRepeatPoint(std::vector<Point_2>& sweep, bool head) {
  if (sweep.empty()) {
    return false;
  }
  if (head || sweep.size() < 2) {
    sweep.erase(sweep.begin());
  } else {
    sweep.erase(std::prev(sweep.end(), 2));
  }
  return true;
}

bool trimRepeatEndpointPair(std::vector<Point_2>& current, bool current_head,
                            std::vector<Point_2>& other, bool other_head) {
  const Point_2& current_endpoint =
      current_head ? current.front() : current.back();
  const Point_2& current_neighbor =
      current_head ? current[1] : current[current.size() - 2];
  const Point_2& other_endpoint = other_head ? other.front() : other.back();
  const Point_2& other_neighbor =
      other_head ? other[1] : other[other.size() - 2];

  if (!CGAL::collinear(current_endpoint, current_neighbor, other_endpoint) ||
      !CGAL::collinear(current_endpoint, current_neighbor, other_neighbor) ||
      !segmentsOverlapOnLine(current_endpoint, current_neighbor,
                             other_endpoint, other_neighbor)) {
    return false;
  }

  if (segmentContainsSegment(other_endpoint, other_neighbor, current_endpoint,
                             current_neighbor)) {
    return eraseCurrentRepeatPoint(current, current_head);
  }
  return eraseOtherRepeatPoint(other, other_head);
}

void normalizeRepeatSweepEndpoints(std::vector<std::vector<Point_2>>& sweeps) {
  for (std::size_t i = 0; i < sweeps.size(); ++i) {
    std::vector<Point_2>& current = sweeps[i];
    if (current.size() < 4) {
      continue;
    }

    if (isTinyEndpointSegment(current.front(), current[1])) {
      current.erase(current.begin());
      continue;
    }
    if (isTinyEndpointSegment(current.back(), current[current.size() - 2])) {
      current.pop_back();
      continue;
    }

    for (std::size_t j = i + 1; j < sweeps.size(); ++j) {
      std::vector<Point_2>& other = sweeps[j];
      if (other.size() < 4) {
        continue;
      }

      if (trimRepeatEndpointPair(current, true, other, true) ||
          trimRepeatEndpointPair(current, true, other, false) ||
          trimRepeatEndpointPair(current, false, other, false) ||
          trimRepeatEndpointPair(current, false, other, true)) {
        break;
      }
    }
  }
}

void appendDecompositionPlan(const DecompositionResult& decomposition,
                             const std::vector<std::vector<Point_2>>& sweeps,
                             Point_2& current, int& output_cell_index,
                             CellPathMap& plan) {
  std::vector<CellNode> nodes =
      calculateDecompositionAdjacency(decomposition.cells);
  int start_cell =
      getCellIndexOfPoint(decomposition.cells, pointToGridPoint(current));
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
    if (shouldReverseNextSweep(current, sweep)) {
      std::reverse(sweep.begin(), sweep.end());
    }

    if (!sweep.empty()) {
      current = sweep.back();
    }
    GridPath path = pointsToGridPath(sweep);
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
  Point_2 current(start.x, start.y);
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
    std::vector<std::vector<Point_2>> sweeps =
        computeVendorSweepsForCells(decomposition,
                                    options.parameters.coverage_length_px,
                                    options.decomposition);
    normalizeRepeatSweepEndpoints(sweeps);
    appendDecompositionPlan(decomposition, sweeps, current, output_cell_index,
                            plan);
  }

  if (plan.empty()) {
    throw std::runtime_error("coverage map produced no safe contours");
  }
  return plan;
}

}  // namespace coverage_native
