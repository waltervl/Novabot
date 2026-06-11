#pragma once

#include <vector>

#include <opencv2/core.hpp>

#include "polygon_coverage_geometry/cgal_definitions.h"

namespace coverage_native {

struct GridContour {
  std::vector<cv::Point> points;
  double area;
  int original_index;
  int parent_index = -1;
  int first_child_index = -1;
};

std::vector<GridContour> findCoverageContours(const cv::Mat& map,
                                              double min_area = 200.0);

std::vector<cv::Point> simplifyContour(const std::vector<cv::Point>& contour,
                                       double epsilon = 1.19);

void removeSelfIntersection(std::vector<cv::Point>& contour,
                            int& recursion_count);

Polygon_2 contourToPolygon(const std::vector<cv::Point>& contour);

PolygonWithHoles contoursToPolygonWithHoles(
    const std::vector<GridContour>& contours);

std::vector<std::size_t> topLevelContourPositionsByDescendingArea(
    const std::vector<GridContour>& contours);

std::vector<GridContour> contourFamilyForTopLevel(
    const std::vector<GridContour>& contours,
    std::size_t top_level_position);

std::vector<PolygonWithHoles> contoursToTopLevelPolygons(
    const std::vector<GridContour>& contours);

}  // namespace coverage_native
