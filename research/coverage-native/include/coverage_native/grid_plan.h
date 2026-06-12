#pragma once

#include <opencv2/core.hpp>

#include "coverage_native/params.h"
#include "coverage_native/planner.h"
#include "coverage_native/tsp.h"

namespace coverage_native {

struct GridPlanOptions {
  CoverageParameters parameters = makeCoverageParametersFromMeters(0.05);
  DecompositionOptions decomposition;
};

CellPathMap generateCoverageGridPlan(const cv::Mat& map,
                                     const GridPoint& start,
                                     const GridPlanOptions& options);

}  // namespace coverage_native
