#pragma once

#include <opencv2/core.hpp>

#include "coverage_native/params.h"

namespace coverage_native {

cv::Mat preprocessObstacleMap(const cv::Mat& map,
                              const CoverageParameters& params);

cv::Mat preprocessMap(const cv::Mat& obstacle_map, const cv::Mat& coverage_map,
                      const CoverageParameters& params);

}  // namespace coverage_native
