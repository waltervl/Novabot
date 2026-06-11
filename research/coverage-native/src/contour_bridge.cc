#include "coverage_native/contour_bridge.h"

#include <algorithm>
#include <iterator>
#include <numeric>
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

std::size_t largestTopLevelContourIndex(
    const std::vector<GridContour>& contours) {
  std::vector<std::size_t> top_level_indices;
  for (std::size_t i = 0; i < contours.size(); ++i) {
    if (contours[i].parent_index < 0) {
      top_level_indices.push_back(i);
    }
  }
  if (top_level_indices.empty()) {
    top_level_indices.resize(contours.size());
    std::iota(top_level_indices.begin(), top_level_indices.end(), 0);
  }

  return static_cast<std::size_t>(
      *std::max_element(
          top_level_indices.begin(), top_level_indices.end(),
          [&contours](std::size_t a, std::size_t b) {
            return contours[a].area < contours[b].area;
          }));
}

std::vector<GridContour> directChildContours(
    const std::vector<GridContour>& contours, int parent_original_index) {
  std::vector<GridContour> children;
  std::copy_if(contours.begin(), contours.end(), std::back_inserter(children),
               [parent_original_index](const GridContour& contour) {
                 return contour.parent_index == parent_original_index;
               });
  std::sort(children.begin(), children.end(),
            [](const GridContour& a, const GridContour& b) {
              return a.original_index < b.original_index;
            });
  return children;
}

}  // namespace

std::vector<GridContour> findCoverageContours(const cv::Mat& map,
                                              double min_area) {
  requireGridMap(map);

  cv::Mat work = map.clone();
  std::vector<std::vector<cv::Point>> raw_contours;
  std::vector<cv::Vec4i> hierarchy;
  cv::findContours(work, raw_contours, hierarchy, cv::RETR_TREE,
                   cv::CHAIN_APPROX_SIMPLE);

  std::vector<GridContour> contours;
  for (std::size_t i = 0; i < raw_contours.size(); ++i) {
    const double area = cv::contourArea(raw_contours[i]);
    if (area > min_area && raw_contours[i].size() >= 3) {
      const cv::Vec4i relation = hierarchy.empty()
                                     ? cv::Vec4i(-1, -1, -1, -1)
                                     : hierarchy[i];
      contours.push_back(GridContour{
          raw_contours[i], area, static_cast<int>(i), relation[3],
          relation[2]});
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

  const std::size_t hull_index = largestTopLevelContourIndex(contours);
  Polygon_2 hull = contourToPolygon(contours[hull_index].points);

  const std::vector<GridContour> child_contours =
      directChildContours(contours, contours[hull_index].original_index);
  std::vector<Polygon_2> holes;
  holes.reserve(child_contours.size());
  for (const GridContour& child_contour : child_contours) {
    holes.push_back(contourToPolygon(child_contour.points));
  }

  PolygonWithHoles polygon(hull, holes.begin(), holes.end());
  polygon_coverage_planning::sortVertices(&polygon);
  return polygon;
}

}  // namespace coverage_native
