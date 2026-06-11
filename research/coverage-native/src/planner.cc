#include "coverage_native/planner.h"

#include <algorithm>
#include <cmath>
#include <iterator>
#include <limits>
#include <stdexcept>

#include <CGAL/number_utils.h>

#include "polygon_coverage_geometry/bcd.h"
#include "polygon_coverage_geometry/decomposition.h"
#include "polygon_coverage_geometry/sweep.h"
#include "polygon_coverage_geometry/visibility_graph.h"

namespace coverage_native {
namespace {

constexpr double kDirectionScale = 100.0;
constexpr double kVendorDegreesToRadians = 0.01745;
constexpr double kVendorQuarterTurnRadians = 1.5707;

Direction_2 scaledDirectionFromRadians(double radians) {
  const int dx = static_cast<int>(std::cos(radians) * kDirectionScale);
  const int dy = static_cast<int>(std::sin(radians) * kDirectionScale);
  if (dx == 0 && dy == 0) {
    throw std::runtime_error("coverage direction collapsed to zero vector");
  }
  return Direction_2(dx, dy);
}

Direction_2 decompositionDirectionFromCoverageDegrees(unsigned char degrees) {
  return scaledDirectionFromRadians(
      (static_cast<double>(degrees) * kVendorDegreesToRadians) +
      kVendorQuarterTurnRadians);
}

double directionAngle(const Direction_2& direction) {
  const Vector_2 vector = direction.vector();
  return std::atan2(CGAL::to_double(vector.y()), CGAL::to_double(vector.x()));
}

Direction_2 specifiedSweepDirectionFromDecompositionDirection(
    const Direction_2& decomposition_direction) {
  return scaledDirectionFromRadians(
      directionAngle(decomposition_direction) + kVendorQuarterTurnRadians);
}

double altitudeSum(const std::vector<Polygon_2>& cells) {
  double sum = 0.0;
  for (const Polygon_2& cell : cells) {
    sum += polygon_coverage_planning::findBestSweepDir(cell);
  }
  return sum;
}

bool waypointsEndAtFinalVertex(const std::vector<Point_2>& waypoints,
                               const Point_2& final_vertex) {
  return (!waypoints.empty() && waypoints.back() == final_vertex) ||
         (waypoints.size() > 1 &&
          *std::prev(waypoints.end(), 2) == final_vertex);
}

bool computeVendorSweep(
    const Polygon_2& cell,
    const polygon_coverage_planning::visibility_graph::VisibilityGraph&
        visibility_graph,
    const FT offset, const Direction_2& direction, bool counter_clockwise,
    std::vector<Point_2>* waypoints) {
  if (waypoints == nullptr) {
    return false;
  }
  waypoints->clear();
  const FT k_sq_offset = offset * offset;

  if (!cell.is_counterclockwise_oriented()) {
    return false;
  }

  Line_2 sweep(Point_2(0.0, 0.0), direction);
  const std::vector<Point_2> sorted_points =
      polygon_coverage_planning::sortVerticesToLine(cell, sweep);
  sweep = Line_2(sorted_points.front(), direction);

  Vector_2 offset_vector = sweep.perpendicular(sorted_points.front()).to_vector();
  offset_vector = offset * offset_vector /
                  std::sqrt(CGAL::to_double(offset_vector.squared_length()));
  const CGAL::Aff_transformation_2<K> full_offset(CGAL::TRANSLATION,
                                                  offset_vector);
  const CGAL::Aff_transformation_2<K> vendor_final_offset(
      CGAL::TRANSLATION, FT(0.6) * offset_vector);

  Segment_2 sweep_segment;
  bool has_sweep_segment =
      polygon_coverage_planning::findSweepSegment(cell, sweep, &sweep_segment);
  int sweep_count = 0;
  bool tried_vendor_final_offset = false;

  while (has_sweep_segment) {
    ++sweep_count;
    if (counter_clockwise) {
      sweep_segment = sweep_segment.opposite();
    }

    if (!waypoints->empty()) {
      std::vector<Point_2> shortest_path;
      if (!polygon_coverage_planning::calculateShortestPath(
              visibility_graph, waypoints->back(), sweep_segment.source(),
              &shortest_path)) {
        return false;
      }
      for (auto it = std::next(shortest_path.begin());
           it != std::prev(shortest_path.end()); ++it) {
        waypoints->push_back(*it);
      }
    }

    waypoints->push_back(sweep_segment.source());
    if (!sweep_segment.is_degenerate()) {
      waypoints->push_back(sweep_segment.target());
    }

    const Line_2 previous_sweep = sweep;
    sweep = sweep.transform(full_offset);
    const Segment_2 previous_sweep_segment =
        counter_clockwise ? sweep_segment.opposite() : sweep_segment;
    has_sweep_segment =
        polygon_coverage_planning::findSweepSegment(cell, sweep,
                                                    &sweep_segment);

    if (!has_sweep_segment &&
        !waypointsEndAtFinalVertex(*waypoints, sorted_points.back())) {
      if (sweep_count > 3 && !tried_vendor_final_offset) {
        sweep = previous_sweep.transform(vendor_final_offset);
        has_sweep_segment =
            polygon_coverage_planning::findSweepSegment(cell, sweep,
                                                        &sweep_segment);
        tried_vendor_final_offset = true;
      }

      if (!has_sweep_segment) {
        sweep = Line_2(sorted_points.back(), direction);
        has_sweep_segment =
            polygon_coverage_planning::findSweepSegment(cell, sweep,
                                                        &sweep_segment);
        if (!has_sweep_segment) {
          return false;
        }
      }

      if (CGAL::squared_distance(sweep_segment, previous_sweep_segment) <
          FT(0.1)) {
        break;
      }
    }

    if (has_sweep_segment) {
      std::vector<Point_2>::const_iterator unobservable_point =
          sorted_points.end();
      polygon_coverage_planning::checkObservability(
          previous_sweep_segment, sweep_segment, sorted_points, k_sq_offset,
          &unobservable_point);
      if (unobservable_point != sorted_points.end()) {
        sweep = Line_2(*unobservable_point, direction);
        has_sweep_segment =
            polygon_coverage_planning::findSweepSegment(cell, sweep,
                                                        &sweep_segment);
        if (!has_sweep_segment) {
          return false;
        }
      }
    }

    counter_clockwise = !counter_clockwise;
  }

  return true;
}

}  // namespace

DecompositionResult decomposeCoveragePolygonWithDirection(
    const PolygonWithHoles& polygon, const DecompositionOptions& options) {
  DecompositionResult result;

  if (options.specify_direction) {
    result.decomposition_direction =
        decompositionDirectionFromCoverageDegrees(
            options.coverage_direction_degrees);
    result.cells =
        polygon_coverage_planning::computeBCD(
            polygon, result.decomposition_direction);
  } else {
    double best_altitude_sum = std::numeric_limits<double>::max();
    const std::vector<Direction_2> directions =
        polygon_coverage_planning::findPerpEdgeDirections(polygon);
    for (const Direction_2& direction : directions) {
      std::vector<Polygon_2> cells =
          polygon_coverage_planning::computeBCD(polygon, direction);
      if (cells.empty()) {
        continue;
      }

      const double candidate_altitude_sum = altitudeSum(cells);
      if (candidate_altitude_sum < best_altitude_sum) {
        best_altitude_sum = candidate_altitude_sum;
        result.decomposition_direction = direction;
        result.cells = std::move(cells);
      }
    }
  }

  if (result.cells.empty()) {
    throw std::runtime_error("coverage decomposition returned no cells");
  }
  return result;
}

std::vector<Polygon_2> decomposeCoveragePolygon(
    const PolygonWithHoles& polygon, const DecompositionOptions& options) {
  return decomposeCoveragePolygonWithDirection(polygon, options).cells;
}

std::vector<std::vector<std::vector<Point_2>>> computeSweepsForCells(
    const std::vector<Polygon_2>& cells, double coverage_length_px) {
  if (coverage_length_px <= 0.0) {
    throw std::invalid_argument("coverage length must be positive");
  }

  std::vector<std::vector<std::vector<Point_2>>> cell_sweeps;
  cell_sweeps.reserve(cells.size());
  for (const Polygon_2& cell : cells) {
    std::vector<std::vector<Point_2>> sweeps;
    if (!polygon_coverage_planning::computeAllSweeps(cell, coverage_length_px,
                                                     &sweeps) ||
        sweeps.empty()) {
      throw std::runtime_error("computeAllSweeps returned no sweeps");
    }
    cell_sweeps.push_back(std::move(sweeps));
  }
  return cell_sweeps;
}

std::vector<std::vector<Point_2>> computeVendorSweepsForCells(
    const DecompositionResult& decomposition, double coverage_length_px,
    const DecompositionOptions& options) {
  if (coverage_length_px <= 0.0) {
    throw std::invalid_argument("coverage length must be positive");
  }

  std::vector<std::vector<Point_2>> sweeps;
  sweeps.reserve(decomposition.cells.size());
  for (const Polygon_2& cell : decomposition.cells) {
    Direction_2 sweep_direction(1, 0);
    polygon_coverage_planning::findBestSweepDir(cell, &sweep_direction);
    if (options.specify_direction) {
      sweep_direction = specifiedSweepDirectionFromDecompositionDirection(
          decomposition.decomposition_direction);
    }

    polygon_coverage_planning::visibility_graph::VisibilityGraph visibility_graph(
        cell);
    std::vector<Point_2> sweep;
    if (!computeVendorSweep(
            cell, visibility_graph, coverage_length_px, sweep_direction, true,
            &sweep) ||
        sweep.empty()) {
      throw std::runtime_error("computeSweep returned no sweep");
    }
    sweeps.push_back(std::move(sweep));
  }
  return sweeps;
}

}  // namespace coverage_native
