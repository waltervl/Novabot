#include "coverage_native/planner.h"

#include <cmath>
#include <stdexcept>

#include "polygon_coverage_geometry/bcd.h"
#include "polygon_coverage_geometry/decomposition.h"
#include "polygon_coverage_geometry/sweep.h"

namespace coverage_native {
namespace {

constexpr double kPi = 3.14159265358979323846;

Direction_2 directionFromCoverageDegrees(unsigned char degrees) {
  const double radians = (static_cast<double>(degrees) * kPi / 180.0) + kPi / 2.0;
  return Direction_2(std::cos(radians), std::sin(radians));
}

}  // namespace

std::vector<Polygon_2> decomposeCoveragePolygon(
    const PolygonWithHoles& polygon, const DecompositionOptions& options) {
  std::vector<Polygon_2> cells;
  if (options.specify_direction) {
    cells = polygon_coverage_planning::computeBCD(
        polygon, directionFromCoverageDegrees(options.coverage_direction_degrees));
  } else if (!polygon_coverage_planning::computeBestBCDFromPolygonWithHoles(
                 polygon, &cells)) {
    throw std::runtime_error("computeBestBCDFromPolygonWithHoles returned no cells");
  }

  if (cells.empty()) {
    throw std::runtime_error("coverage decomposition returned no cells");
  }
  return cells;
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

}  // namespace coverage_native
