#include "coverage_native/preprocess.h"

#include <stdexcept>

#include <opencv2/imgproc.hpp>

namespace coverage_native {
namespace {

constexpr int kVendorOpenKernelSize = 3;
constexpr int kVendorOpenIterations = 2;

void requireGridMap(const cv::Mat& input) {
  if (input.empty()) {
    throw std::invalid_argument("input map must not be empty");
  }
  if (input.type() != CV_8UC1) {
    throw std::invalid_argument("input map must be CV_8UC1");
  }
}

cv::Mat morphEllipse(const cv::Mat& input, int operation, int kernel_size,
                     int iterations) {
  requireGridMap(input);
  if (kernel_size <= 0 || iterations < 0) {
    throw std::invalid_argument("invalid morphology parameters");
  }

  cv::Mat output;
  const cv::Mat kernel = cv::getStructuringElement(
      cv::MORPH_ELLIPSE, cv::Size(kernel_size, kernel_size));
  cv::morphologyEx(input, output, operation, kernel, cv::Point(-1, -1),
                   iterations);
  return output;
}

cv::Mat thresholdOccupancy(const cv::Mat& input,
                           const CoverageParameters& params) {
  requireGridMap(input);

  const unsigned char unknown_value =
      params.unknown_as_free ? 0 : static_cast<unsigned char>(
                                      params.unknown_value);
  cv::Mat output;
  cv::threshold(input, output, static_cast<double>(unknown_value), 255.0,
                cv::THRESH_BINARY);
  return output;
}

cv::Mat preprocessMapWithVendorKernels(const cv::Mat& input,
                                       int erode_kernel_size,
                                       int morph_open_flag,
                                       const CoverageParameters& params) {
  const cv::Mat thresholded = thresholdOccupancy(input, params);
  cv::Mat output = morphEllipse(thresholded, cv::MORPH_ERODE,
                                erode_kernel_size, 1);
  if (morph_open_flag > 0) {
    output = morphEllipse(output, cv::MORPH_OPEN, kVendorOpenKernelSize,
                          kVendorOpenIterations);
  }
  return output;
}

}  // namespace

cv::Mat preprocessObstacleMap(const cv::Mat& map,
                              const CoverageParameters& params) {
  return preprocessMapWithVendorKernels(map, params.obstacle_erode_value,
                                        params.obstacle_open_iterations,
                                        params);
}

cv::Mat preprocessMap(const cv::Mat& obstacle_map, const cv::Mat& coverage_map,
                      const CoverageParameters& params) {
  if (obstacle_map.size() != coverage_map.size()) {
    throw std::invalid_argument("obstacle and coverage maps must match");
  }

  const cv::Mat opened_obstacle =
      preprocessMapWithVendorKernels(obstacle_map, params.obstacle_erode_value,
                                      params.obstacle_open_iterations, params);
  const cv::Mat opened_coverage =
      preprocessMapWithVendorKernels(coverage_map, params.coverage_erode_value,
                                      params.coverage_open_iterations, params);

  cv::Mat output;
  cv::bitwise_and(opened_obstacle, opened_coverage, output);
  return output;
}

}  // namespace coverage_native
