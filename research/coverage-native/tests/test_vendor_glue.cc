#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#include <opencv2/core.hpp>

#include "coverage_native/params.h"
#include "coverage_native/preprocess.h"
#include "coverage_native/world_convert.h"

namespace {

void require(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void requireNear(double actual, double expected, double epsilon,
                 const std::string& message) {
  if (std::fabs(actual - expected) > epsilon) {
    throw std::runtime_error(message + ": expected " +
                             std::to_string(expected) + ", got " +
                             std::to_string(actual));
  }
}

void testCoverageParametersFromMeters() {
  const coverage_native::CoverageParameters params =
      coverage_native::makeCoverageParametersFromMeters(0.05);

  require(params.obstacle_inflation_px == 12,
          "obstacle inflation must truncate 0.61m / 0.05m");
  require(params.boundary_inflation_px == 1,
          "coverage path boundary inflation is hardcoded to 1px");
  require(params.coverage_length_px == 3,
          "coverage length must truncate 0.16m / 0.05m");
  require(params.unknown_value == -6, "unknown sentinel must be -6");
  require(!params.unknown_as_free, "unknown_as_free default must be false");

  require(params.obstacle_erode_value == 25,
          "obstacle erode kernel must be 2 * inflation + 1");
  require(params.coverage_erode_value == 3,
          "coverage erode kernel must be odd coverage length");
  require(params.boundary_erode_value == 3,
          "boundary erode kernel must be 2 * boundary + 1");
  require(params.obstacle_open_iterations == 1,
          "obstacle open iterations must match vendor constant");
  require(params.coverage_open_iterations == 1,
          "coverage open iterations must match vendor constant");
  require(params.boundary_open_iterations == 2,
          "boundary open iterations must match vendor constant");
}

void testCoverageParametersFromPixels() {
  const coverage_native::CoverageParameters params =
      coverage_native::makeCoverageParametersFromPixels(12, 1, 4, -6, true);

  require(params.coverage_length_px == 4,
          "coverage length stores the raw pixel value");
  require(params.coverage_erode_value == 5,
          "coverage erode kernel must force an odd size");
  require(params.unknown_as_free, "unknown_as_free must be preserved");
}

void testPreprocessMap() {
  cv::Mat obstacle(31, 31, CV_8UC1, cv::Scalar(255));
  cv::Mat coverage(31, 31, CV_8UC1, cv::Scalar(0));
  coverage(cv::Rect(10, 10, 11, 11)).setTo(255);

  const cv::Mat preprocessed = coverage_native::preprocessMap(
      obstacle, coverage, coverage_native::makeCoverageParametersFromMeters(0.05));

  require(preprocessed.type() == CV_8UC1, "preprocess output must be CV_8UC1");
  require(preprocessed.rows == 31 && preprocessed.cols == 31,
          "preprocess output size must match input");

  for (int y = 0; y < preprocessed.rows; ++y) {
    for (int x = 0; x < preprocessed.cols; ++x) {
      const bool inside_rect = x >= 10 && x <= 20 && y >= 10 && y <= 20;
      const bool corner =
          (x == 10 || x == 20) && (y == 10 || y == 20);
      const unsigned char expected = inside_rect && !corner ? 255 : 0;
      if (preprocessed.at<unsigned char>(y, x) != expected) {
        throw std::runtime_error("unexpected preprocessed pixel at " +
                                 std::to_string(x) + "," +
                                 std::to_string(y));
      }
    }
  }
}

void testWorldTransform() {
  const coverage_native::MapMetadata map{
      181,   // width
      124,   // height
      0.05,  // resolution
      -1.25, // origin_x
      2.50,  // origin_y
  };

  const coverage_native::WorldPoint top_left =
      coverage_native::mapToWorld(0, 0, map);
  requireNear(top_left.x, -1.225, 1e-9, "top-left x");
  requireNear(top_left.y, 8.675, 1e-9, "top-left y must flip image y");

  const coverage_native::WorldPoint bottom_right =
      coverage_native::mapToWorld(180, 123, map);
  requireNear(bottom_right.x, 7.775, 1e-9, "bottom-right x");
  requireNear(bottom_right.y, 2.525, 1e-9, "bottom-right y");
}

}  // namespace

int main() {
  try {
    testCoverageParametersFromMeters();
    testCoverageParametersFromPixels();
    testPreprocessMap();
    testWorldTransform();
  } catch (const std::exception& e) {
    std::cerr << "coverage_vendor_glue_test: " << e.what() << "\n";
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
