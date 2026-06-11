#include "coverage_native/tsp.h"

#include <algorithm>
#include <cmath>
#include <deque>
#include <limits>
#include <numeric>

#include <CGAL/Boolean_set_operations_2.h>
#include <CGAL/number_utils.h>

#include "polygon_coverage_geometry/cgal_comm.h"

namespace coverage_native {
namespace {

double pointManhattanDistance(const Point_2& a, const GridPoint& b) {
  return std::abs(CGAL::to_double(a.x()) - static_cast<double>(b.x)) +
         std::abs(CGAL::to_double(a.y()) - static_cast<double>(b.y));
}

void walkThroughGraph(std::vector<CellNode>& nodes, int index, int& remaining,
                      std::deque<CellNode>& ordered) {
  if (index < 0 || index >= static_cast<int>(nodes.size())) {
    return;
  }

  CellNode& node = nodes[static_cast<std::size_t>(index)];
  if (!node.visited) {
    node.visited = true;
    --remaining;
  }
  ordered.push_front(node);

  for (const int neighbor : node.adjacent) {
    if (neighbor < 0 || neighbor >= static_cast<int>(nodes.size())) {
      continue;
    }
    if (!nodes[static_cast<std::size_t>(neighbor)].visited) {
      nodes[static_cast<std::size_t>(neighbor)].parent = node.cell_index;
      walkThroughGraph(nodes, neighbor, remaining, ordered);
      return;
    }
  }

  if (node.parent != 0x7fffffff && remaining != 0) {
    walkThroughGraph(nodes, node.parent, remaining, ordered);
  }
}

}  // namespace

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

std::vector<CellNode> calculateDecompositionAdjacency(
    const std::vector<Polygon_2>& cells) {
  std::vector<CellNode> nodes(cells.size());
  for (std::size_t i = 0; i < nodes.size(); ++i) {
    nodes[i].cell_index = static_cast<int>(i);
  }

  for (std::size_t i = 0; i < cells.size(); ++i) {
    for (std::size_t j = i + 1; j < cells.size(); ++j) {
      PolygonWithHoles joined;
      if (CGAL::join(cells[i], cells[j], joined)) {
        nodes[i].adjacent.push_back(static_cast<int>(j));
        nodes[j].adjacent.push_back(static_cast<int>(i));
      }
    }
  }

  return nodes;
}

int getCellIndexOfPoint(const std::vector<Polygon_2>& cells,
                        const GridPoint& point) {
  if (cells.empty()) {
    return -1;
  }

  const Point_2 cgal_point(point.x, point.y);
  for (std::size_t i = 0; i < cells.size(); ++i) {
    if (polygon_coverage_planning::pointInPolygon(cells[i], cgal_point)) {
      return static_cast<int>(i);
    }
  }

  double best_distance = std::numeric_limits<double>::max();
  int best_index = -1;
  for (std::size_t i = 0; i < cells.size(); ++i) {
    double cell_best = std::numeric_limits<double>::max();
    for (VertexConstIterator vertex = cells[i].vertices_begin();
         vertex != cells[i].vertices_end(); ++vertex) {
      cell_best = std::min(cell_best, pointManhattanDistance(*vertex, point));
    }
    if (cell_best < best_distance) {
      best_distance = cell_best;
      best_index = static_cast<int>(i);
    }
  }
  return best_index;
}

std::vector<int> getTravellingPath(const std::vector<CellNode>& nodes,
                                   int start_index) {
  if (nodes.empty()) {
    return {};
  }
  if (nodes.size() == 1) {
    return {0};
  }

  std::vector<CellNode> mutable_nodes = nodes;
  std::deque<CellNode> ordered_nodes;
  int remaining = static_cast<int>(mutable_nodes.size());
  walkThroughGraph(mutable_nodes, start_index, remaining, ordered_nodes);

  std::vector<int> path;
  path.reserve(ordered_nodes.size());
  for (auto it = ordered_nodes.rbegin(); it != ordered_nodes.rend(); ++it) {
    path.push_back(it->cell_index);
  }
  return path;
}

bool shouldReverseNextSweep(const Point_2& current,
                            const std::vector<Point_2>& sweep) {
  if (sweep.empty()) {
    return false;
  }
  const double front_distance =
      CGAL::to_double(CGAL::squared_distance(current, sweep.front()));
  const double back_distance =
      CGAL::to_double(CGAL::squared_distance(current, sweep.back()));
  return back_distance < front_distance;
}

}  // namespace coverage_native
