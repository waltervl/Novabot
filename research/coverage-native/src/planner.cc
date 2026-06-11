#include "coverage_native/planner.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

#include <CGAL/number_utils.h>

#include "polygon_coverage_geometry/bcd.h"
#include "polygon_coverage_geometry/decomposition.h"
#include "polygon_coverage_geometry/sweep.h"
#include "polygon_coverage_geometry/visibility_graph.h"

namespace coverage_native {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kDirectionScale = 100.0;

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
      (static_cast<double>(degrees) * kPi / 180.0) + kPi / 2.0);
}

Direction_2 sweepDirectionFromCoverageDegrees(unsigned char degrees) {
  return scaledDirectionFromRadians(
      static_cast<double>(degrees) * kPi / 180.0);
}

double altitudeSum(const std::vector<Polygon_2>& cells) {
  double sum = 0.0;
  for (const Polygon_2& cell : cells) {
    sum += polygon_coverage_planning::findBestSweepDir(cell);
  }
  return sum;
}

double sweepNormalCoordinate(const Point_2& point,
                             const Direction_2& sweep_direction) {
  const Vector_2 direction = sweep_direction.vector();
  const double dx = CGAL::to_double(direction.x());
  const double dy = CGAL::to_double(direction.y());
  const double x = CGAL::to_double(point.x());
  const double y = CGAL::to_double(point.y());
  return (-dy * x) + (dx * y);
}

bool strictlyBetween(double value, double a, double b) {
  constexpr double kEpsilon = 1.0e-6;
  const double low = std::min(a, b);
  const double high = std::max(a, b);
  return value > low + kEpsilon && value < high - kEpsilon;
}

void insertVendorFinalSweep(const Polygon_2& cell,
                            const Direction_2& sweep_direction,
                            std::vector<Point_2>* sweep) {
  if (sweep == nullptr || sweep->size() < 3) {
    return;
  }

  const Point_2& final_point = sweep->back();
  const Point_2& previous_start = (*sweep)[sweep->size() - 3];
  const Point_2& previous_end = (*sweep)[sweep->size() - 2];
  if (CGAL::collinear(final_point, final_point + sweep_direction.vector(),
                      previous_end)) {
    return;
  }
  if (CGAL::collinear(previous_start, previous_end, final_point)) {
    return;
  }

  const double previous_coordinate =
      (sweepNormalCoordinate(previous_start, sweep_direction) +
       sweepNormalCoordinate(previous_end, sweep_direction)) /
      2.0;
  const double final_coordinate =
      sweepNormalCoordinate(final_point, sweep_direction);

  if (!strictlyBetween((previous_coordinate + final_coordinate) / 2.0,
                       previous_coordinate, final_coordinate)) {
    return;
  }

  const Vector_2 direction = sweep_direction.vector();
  const Vector_2 normal(-direction.y(), direction.x());
  const FT previous_exact_coordinate =
      (normal.x() * previous_start.x()) + (normal.y() * previous_start.y());
  const FT final_exact_coordinate =
      (normal.x() * final_point.x()) + (normal.y() * final_point.y());
  const FT shift =
      (previous_exact_coordinate - final_exact_coordinate) /
      (FT(2) * normal.squared_length());
  const Point_2 midpoint =
      final_point + (normal * shift);

  Segment_2 segment;
  if (!polygon_coverage_planning::findSweepSegment(
          cell, Line_2(midpoint, sweep_direction), &segment) ||
      segment.is_degenerate()) {
    return;
  }

  Point_2 source = segment.source();
  Point_2 target = segment.target();
  if (CGAL::squared_distance(previous_end, target) <
      CGAL::squared_distance(previous_end, source)) {
    std::swap(source, target);
  }

  sweep->insert(std::prev(sweep->end()), source);
  sweep->insert(std::prev(sweep->end()), target);
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
      sweep_direction =
          sweepDirectionFromCoverageDegrees(options.coverage_direction_degrees);
    }

    polygon_coverage_planning::visibility_graph::VisibilityGraph visibility_graph(
        cell);
    std::vector<Point_2> sweep;
    if (!polygon_coverage_planning::computeSweep(
            cell, visibility_graph, coverage_length_px, sweep_direction,
            true, &sweep) ||
        sweep.empty()) {
      throw std::runtime_error("computeSweep returned no sweep");
    }
    insertVendorFinalSweep(cell, sweep_direction, &sweep);
    sweeps.push_back(std::move(sweep));
  }
  return sweeps;
}

}  // namespace coverage_native
