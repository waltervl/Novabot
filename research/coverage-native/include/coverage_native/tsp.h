#pragma once

#include <map>
#include <vector>

#include "coverage_native/contour_bridge.h"
#include "polygon_coverage_geometry/cgal_definitions.h"

namespace coverage_native {

struct GridPoint {
  int x;
  int y;
};

using GridPath = std::vector<GridPoint>;
using CellPathMap = std::map<int, GridPath>;

struct CellNode {
  bool visited = false;
  int parent = 0x7fffffff;
  std::vector<int> adjacent;
  int cell_index = 0x7fffffff;
};

double calculatePathLength(const GridPath& path);
int calculateRotations(const GridPath& path);

double pathAssessFunction(const CellPathMap& paths, double resolution_m = 0.05,
                          double drive_speed_mps = 0.4,
                          double quarter_turn_radians = 1.57,
                          double turn_speed_radps = 0.8);

std::vector<int> orderContourIndicesByDescendingArea(
    const std::vector<GridContour>& contours);

std::vector<CellNode> calculateDecompositionAdjacency(
    const std::vector<Polygon_2>& cells);

int getCellIndexOfPoint(const std::vector<Polygon_2>& cells,
                        const GridPoint& point);

std::vector<int> getTravellingPath(const std::vector<CellNode>& nodes,
                                   int start_index);

bool shouldReverseNextSweep(const Point_2& current,
                            const std::vector<Point_2>& sweep);

}  // namespace coverage_native
