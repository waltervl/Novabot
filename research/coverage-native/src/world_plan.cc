#include "coverage_native/world_plan.h"

#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace coverage_native {
namespace {

WorldPoint checkedMapToWorld(const GridPoint& point,
                             const MapMetadata& metadata) {
  if (point.x < 0 || point.y < 0) {
    throw std::out_of_range("grid coordinate outside metadata bounds");
  }
  return mapToWorld(static_cast<unsigned int>(point.x),
                    static_cast<unsigned int>(point.y), metadata);
}

}  // namespace

WorldPathMap gridPlanToWorldPlan(const CellPathMap& grid_plan,
                                 const MapMetadata& metadata) {
  WorldPathMap world_plan;
  for (const auto& cell : grid_plan) {
    WorldPath path;
    path.reserve(cell.second.size());
    for (const GridPoint& point : cell.second) {
      path.push_back(checkedMapToWorld(point, metadata));
    }
    world_plan.emplace(cell.first, std::move(path));
  }
  return world_plan;
}

WorldPathMap generateCoverageWorldPlan(const cv::Mat& map,
                                       const GridPoint& start,
                                       const MapMetadata& metadata,
                                       const GridPlanOptions& options) {
  return gridPlanToWorldPlan(generateCoverageGridPlan(map, start, options),
                             metadata);
}

std::string formatWorldPath(const WorldPath& path) {
  std::ostringstream out;
  out << std::fixed << std::setprecision(2);
  bool first = true;
  for (const WorldPoint& point : path) {
    if (!first) {
      out << ",";
    }
    first = false;
    out << point.x << " " << point.y;
  }
  return out.str();
}

std::string plannedPathJson(const WorldPathMap& plan, int area_id) {
  std::ostringstream out;
  out << "{\"" << area_id << "\":{";
  bool first_cell = true;
  for (const auto& cell : plan) {
    if (!first_cell) {
      out << ",";
    }
    first_cell = false;
    out << "\"" << cell.first << "\":\"" << formatWorldPath(cell.second)
        << "\"";
  }
  out << "}}\n";
  return out.str();
}

}  // namespace coverage_native
