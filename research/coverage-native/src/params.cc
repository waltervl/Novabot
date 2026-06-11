#include "coverage_native/params.h"

#include <cmath>
#include <stdexcept>

namespace coverage_native {
namespace {

int truncateMetersToPixels(double meters, double resolution_m) {
  if (resolution_m <= 0.0) {
    throw std::invalid_argument("resolution must be positive");
  }
  return static_cast<int>(std::trunc(meters / resolution_m));
}

int forceOddKernelSize(int value) {
  if (value <= 0) {
    return 1;
  }
  return value | 1;
}

}  // namespace

CoverageParameters makeCoverageParametersFromPixels(
    int obstacle_inflation_px, int boundary_inflation_px,
    int coverage_length_px, int unknown_value, bool unknown_as_free) {
  if (obstacle_inflation_px < 0 || boundary_inflation_px < 0 ||
      coverage_length_px <= 0) {
    throw std::invalid_argument("coverage parameters must be non-negative");
  }

  CoverageParameters params{};
  params.obstacle_inflation_px = obstacle_inflation_px;
  params.boundary_inflation_px = boundary_inflation_px;
  params.coverage_length_px = coverage_length_px;
  params.unknown_value = unknown_value;
  params.unknown_as_free = unknown_as_free;

  params.obstacle_erode_value = 2 * obstacle_inflation_px + 1;
  params.coverage_erode_value = forceOddKernelSize(coverage_length_px);
  params.boundary_erode_value = 2 * boundary_inflation_px + 1;
  params.obstacle_open_iterations = 2;
  params.coverage_open_iterations = 2;
  params.boundary_open_iterations = 2;
  return params;
}

CoverageParameters makeCoverageParametersFromMeters(
    double resolution_m, double obstacle_inflation_m,
    int boundary_inflation_px, double planner_coverage_length_m,
    int unknown_value, bool unknown_as_free) {
  return makeCoverageParametersFromPixels(
      truncateMetersToPixels(obstacle_inflation_m, resolution_m),
      boundary_inflation_px,
      truncateMetersToPixels(planner_coverage_length_m, resolution_m),
      unknown_value, unknown_as_free);
}

}  // namespace coverage_native
