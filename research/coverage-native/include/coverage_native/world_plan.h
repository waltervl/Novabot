#pragma once

#include <map>
#include <string>
#include <vector>

#include "coverage_native/grid_plan.h"
#include "coverage_native/world_convert.h"

namespace coverage_native {

using WorldPath = std::vector<WorldPoint>;
using WorldPathMap = std::map<int, WorldPath>;

WorldPathMap gridPlanToWorldPlan(const CellPathMap& grid_plan,
                                 const MapMetadata& metadata);

WorldPathMap generateCoverageWorldPlan(const cv::Mat& map,
                                       const GridPoint& start,
                                       const MapMetadata& metadata,
                                       const GridPlanOptions& options);

std::string formatWorldPath(const WorldPath& path);

std::string plannedPathJson(const WorldPathMap& plan, int area_id = 1);

}  // namespace coverage_native
