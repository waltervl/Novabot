#include "coverage_native/contour_bridge.h"

#include <algorithm>
#include <iterator>
#include <stdexcept>

#include <opencv2/imgproc.hpp>

#include "polygon_coverage_geometry/cgal_comm.h"

namespace coverage_native {
namespace {

void requireGridMap(const cv::Mat& map) {
  if (map.empty()) {
    throw std::invalid_argument("contour map must not be empty");
  }
  if (map.type() != CV_8UC1) {
    throw std::invalid_argument("contour map must be CV_8UC1");
  }
}

std::size_t largestContourIndex(const std::vector<GridContour>& contours) {
  return static_cast<std::size_t>(
      std::distance(contours.begin(),
                    std::max_element(
                        contours.begin(), contours.end(),
                        [](const GridContour& a, const GridContour& b) {
                          return a.area < b.area;
                        })));
}

}  // namespace

std::vector<GridContour> findCoverageContours(const cv::Mat& map,
                                              double min_area) {
  requireGridMap(map);

  cv::Mat work = map.clone();
  std::vector<std::vector<cv::Point>> raw_contours;
  cv::findContours(work, raw_contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);

  std::vector<GridContour> contours;
  for (std::size_t i = 0; i < raw_contours.size(); ++i) {
    const double area = cv::contourArea(raw_contours[i]);
    if (area > min_area && raw_contours[i].size() >= 3) {
      contours.push_back(GridContour{raw_contours[i], area,
                                     static_cast<int>(i)});
    }
  }
  return contours;
}

std::vector<cv::Point> simplifyContour(const std::vector<cv::Point>& contour,
                                       double epsilon) {
  if (contour.size() < 3) {
    throw std::invalid_argument("contour must have at least three points");
  }

  std::vector<cv::Point> simplified;
  cv::approxPolyDP(contour, simplified, epsilon, true);
  if (simplified.size() < 3) {
    throw std::invalid_argument("simplified contour has fewer than three points");
  }
  return simplified;
}

Polygon_2 contourToPolygon(const std::vector<cv::Point>& contour) {
  const std::vector<cv::Point> simplified = simplifyContour(contour);

  Polygon_2 polygon;
  for (const cv::Point& point : simplified) {
    polygon.push_back(Point_2(point.x, point.y));
  }
  return polygon;
}

PolygonWithHoles contoursToPolygonWithHoles(
    const std::vector<GridContour>& contours) {
  if (contours.empty()) {
    throw std::invalid_argument("cannot build polygon without contours");
  }

  const std::size_t hull_index = largestContourIndex(contours);
  Polygon_2 hull = contourToPolygon(contours[hull_index].points);

  std::vector<Polygon_2> holes;
  holes.reserve(contours.size() - 1);
  for (std::size_t i = 0; i < contours.size(); ++i) {
    if (i == hull_index) {
      continue;
    }
    holes.push_back(contourToPolygon(contours[i].points));
  }

  PolygonWithHoles polygon(hull, holes.begin(), holes.end());
  polygon_coverage_planning::sortVertices(&polygon);
  return polygon;
}

}  // namespace coverage_native
