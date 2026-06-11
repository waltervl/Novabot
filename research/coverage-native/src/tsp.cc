#include "coverage_native/tsp.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace coverage_native {

double calculatePathLength(const GridPath& path) {
  if (path.size() < 2) {
    return 0.0;
  }

  double length = 0.0;
  for (std::size_t i = 1; i < path.size(); ++i) {
    const double dx = static_cast<double>(path[i].x - path[i - 1].x);
    const double dy = static_cast<double>(path[i].y - path[i - 1].y);
    length += std::hypot(dx, dy);
  }
  return length;
}

int calculateRotations(const GridPath& path) {
  return static_cast<int>(path.size());
}

double pathAssessFunction(const CellPathMap& paths, double resolution_m,
                          double drive_speed_mps,
                          double quarter_turn_radians,
                          double turn_speed_radps) {
  double path_length_px = 0.0;
  int rotations = 0;
  for (const auto& entry : paths) {
    path_length_px += calculatePathLength(entry.second);
    rotations += calculateRotations(entry.second);
  }

  return path_length_px * resolution_m / drive_speed_mps +
         static_cast<double>(rotations) * quarter_turn_radians /
             turn_speed_radps;
}

std::vector<int> orderContourIndicesByDescendingArea(
    const std::vector<GridContour>& contours) {
  std::vector<std::size_t> positions(contours.size());
  std::iota(positions.begin(), positions.end(), 0);
  std::sort(positions.begin(), positions.end(),
            [&contours](std::size_t a, std::size_t b) {
              return contours[a].area > contours[b].area;
            });

  std::vector<int> ordered;
  ordered.reserve(positions.size());
  for (const std::size_t position : positions) {
    ordered.push_back(contours[position].original_index);
  }
  return ordered;
}

}  // namespace coverage_native
