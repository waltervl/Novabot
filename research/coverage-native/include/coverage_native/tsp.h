#pragma once

#include <map>
#include <vector>

#include "coverage_native/contour_bridge.h"

namespace coverage_native {

struct GridPoint {
  int x;
  int y;
};

using GridPath = std::vector<GridPoint>;
using CellPathMap = std::map<int, GridPath>;

double calculatePathLength(const GridPath& path);
int calculateRotations(const GridPath& path);

double pathAssessFunction(const CellPathMap& paths, double resolution_m = 0.05,
                          double drive_speed_mps = 0.4,
                          double quarter_turn_radians = 1.57,
                          double turn_speed_radps = 0.8);

std::vector<int> orderContourIndicesByDescendingArea(
    const std::vector<GridContour>& contours);

}  // namespace coverage_native
