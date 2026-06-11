#pragma once

#include <vector>

#include <opencv2/core.hpp>

#include "polygon_coverage_geometry/cgal_definitions.h"

namespace coverage_native {

struct GridContour {
  std::vector<cv::Point> points;
  double area;
  int original_index;
};

std::vector<GridContour> findCoverageContours(const cv::Mat& map,
                                              double min_area = 200.0);

std::vector<cv::Point> simplifyContour(const std::vector<cv::Point>& contour,
                                       double epsilon = 1.0);

Polygon_2 contourToPolygon(const std::vector<cv::Point>& contour);

PolygonWithHoles contoursToPolygonWithHoles(
    const std::vector<GridContour>& contours);

}  // namespace coverage_native
