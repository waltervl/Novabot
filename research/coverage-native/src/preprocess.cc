#include "coverage_native/preprocess.h"

#include <stdexcept>

#include <opencv2/imgproc.hpp>

namespace coverage_native {
namespace {

cv::Mat morphOpenEllipse(const cv::Mat& input, int kernel_size,
                         int iterations) {
  if (input.empty()) {
    throw std::invalid_argument("input map must not be empty");
  }
  if (input.type() != CV_8UC1) {
    throw std::invalid_argument("input map must be CV_8UC1");
  }
  if (kernel_size <= 0 || iterations < 0) {
    throw std::invalid_argument("invalid morphology parameters");
  }

  cv::Mat output;
  const cv::Mat kernel = cv::getStructuringElement(
      cv::MORPH_ELLIPSE, cv::Size(kernel_size, kernel_size));
  cv::morphologyEx(input, output, cv::MORPH_OPEN, kernel, cv::Point(-1, -1),
                   iterations);
  return output;
}

}  // namespace

cv::Mat preprocessMap(const cv::Mat& obstacle_map, const cv::Mat& coverage_map,
                      const CoverageParameters& params) {
  if (obstacle_map.size() != coverage_map.size()) {
    throw std::invalid_argument("obstacle and coverage maps must match");
  }

  const cv::Mat opened_obstacle =
      morphOpenEllipse(obstacle_map, params.obstacle_erode_value,
                       params.obstacle_open_iterations);
  const cv::Mat opened_coverage =
      morphOpenEllipse(coverage_map, params.coverage_erode_value,
                       params.coverage_open_iterations);

  cv::Mat output;
  cv::bitwise_and(opened_obstacle, opened_coverage, output);
  return output;
}

}  // namespace coverage_native
