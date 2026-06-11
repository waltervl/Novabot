#include "coverage_native/planner.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

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
    sweeps.push_back(std::move(sweep));
  }
  return sweeps;
}

}  // namespace coverage_native
