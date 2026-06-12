#pragma once

namespace coverage_native {

struct CoverageParameters {
  int obstacle_inflation_px;
  int boundary_inflation_px;
  int coverage_length_px;
  int unknown_value;
  bool unknown_as_free;

  int obstacle_erode_value;
  int coverage_erode_value;
  int boundary_erode_value;
  int obstacle_open_iterations;
  int coverage_open_iterations;
  int boundary_open_iterations;
};

CoverageParameters makeCoverageParametersFromPixels(
    int obstacle_inflation_px, int boundary_inflation_px,
    int coverage_length_px, int unknown_value, bool unknown_as_free);

CoverageParameters makeCoverageParametersFromMeters(
    double resolution_m, double obstacle_inflation_m = 0.61,
    int boundary_inflation_px = 1, double planner_coverage_length_m = 0.16,
    int unknown_value = -6, bool unknown_as_free = false);

}  // namespace coverage_native
