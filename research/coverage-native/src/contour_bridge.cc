#include "coverage_native/contour_bridge.h"

#include <algorithm>
#include <cmath>
#include <iterator>
#include <numeric>
#include <stdexcept>
#include <unordered_set>

#include <opencv2/imgproc.hpp>

#include "polygon_coverage_geometry/cgal_comm.h"

namespace coverage_native {
namespace {

constexpr double kSelfIntersectionDistance = 1.1;
constexpr double kCollinearAngleTolerance = 0.35;

void requireGridMap(const cv::Mat& map) {
  if (map.empty()) {
    throw std::invalid_argument("contour map must not be empty");
  }
  if (map.type() != CV_8UC1) {
    throw std::invalid_argument("contour map must be CV_8UC1");
  }
}

float pointToLineMinGridDis(const cv::Point& line_start,
                            const cv::Point& line_end,
                            const cv::Point& point) {
  const int dx = line_end.x - line_start.x;
  const int dy = line_end.y - line_start.y;
  const int steps = std::max(std::abs(dx), std::abs(dy));
  if (steps == 0) {
    return 1.0e7F;
  }

  float best = 1.0e7F;
  for (int i = 0; i != steps; ++i) {
    const float x = static_cast<float>(line_start.x) +
                    static_cast<float>(i) *
                        (static_cast<float>(dx) / static_cast<float>(steps));
    const float y = static_cast<float>(line_start.y) +
                    static_cast<float>(i) *
                        (static_cast<float>(dy) / static_cast<float>(steps));
    best = std::min(
        best, std::hypot(x - static_cast<float>(point.x),
                         y - static_cast<float>(point.y)));
  }
  return best;
}

std::vector<cv::Point> rotateContourHalf(const std::vector<cv::Point>& points) {
  const std::size_t half = points.size() / 2;
  std::vector<cv::Point> rotated;
  rotated.reserve(points.size());
  rotated.insert(rotated.end(), points.begin() + half, points.end());
  rotated.insert(rotated.end(), points.begin(), points.begin() + half);
  return rotated;
}

std::vector<std::size_t> topLevelContourPositions(
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
  return top_level_indices;
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
  int recursion_count = 0;
  removeSelfIntersection(simplified, recursion_count);
  if (simplified.size() < 3) {
    throw std::invalid_argument("simplified contour has fewer than three points");
  }
  return simplified;
}

void removeSelfIntersection(std::vector<cv::Point>& contour,
                            int& recursion_count) {
  if (contour.size() < 6) {
    return;
  }

  ++recursion_count;
  std::vector<unsigned int> remove_indices;

  std::size_t index = 1;
  while (index < contour.size() - 1) {
    const cv::Point& prev = contour[index - 1];
    const cv::Point& current = contour[index];
    const cv::Point& next = contour[index + 1];
    const double incoming =
        std::atan2(static_cast<double>(current.x - prev.x),
                   static_cast<double>(current.y - prev.y));
    const double outgoing =
        std::atan2(static_cast<double>(current.x - next.x),
                   static_cast<double>(current.y - next.y));
    if (std::abs(incoming - outgoing) < kCollinearAngleTolerance) {
      remove_indices.push_back(static_cast<unsigned int>(index));
      break;
    }

    bool found_close_segment = false;
    for (std::size_t probe = index + 2; probe < contour.size() - 4;
         ++probe) {
      const float distance = pointToLineMinGridDis(
          contour[probe], contour[probe + 1], contour[index]);
      if (distance < kSelfIntersectionDistance) {
        for (std::size_t remove = index; remove < probe; ++remove) {
          remove_indices.push_back(static_cast<unsigned int>(remove));
        }
        index = probe + 2;
        found_close_segment = true;
        break;
      }
    }

    if (!found_close_segment) {
      ++index;
    }
  }

  if (remove_indices.empty()) {
    if (recursion_count < 2) {
      contour = rotateContourHalf(contour);
      removeSelfIntersection(contour, recursion_count);
    }
    return;
  }

  std::unordered_set<unsigned int> remove_set(remove_indices.begin(),
                                             remove_indices.end());
  std::vector<cv::Point> cleaned;
  cleaned.reserve(contour.size());
  for (std::size_t i = 0; i < contour.size(); ++i) {
    if (remove_set.count(static_cast<unsigned int>(i)) == 0) {
      cleaned.push_back(contour[i]);
    }
  }
  contour = std::move(cleaned);

  if (recursion_count < 9) {
    removeSelfIntersection(contour, recursion_count);
  }
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

  const std::vector<std::size_t> top_level_indices =
      topLevelContourPositionsByDescendingArea(contours);
  const std::size_t hull_index = top_level_indices.front();
  const std::vector<GridContour> family =
      contourFamilyForTopLevel(contours, hull_index);

  Polygon_2 hull = contourToPolygon(family.front().points);

  const std::vector<GridContour> child_contours =
      directChildContours(family, family.front().original_index);
  std::vector<Polygon_2> holes;
  holes.reserve(child_contours.size());
  for (const GridContour& child_contour : child_contours) {
    holes.push_back(contourToPolygon(child_contour.points));
  }

  PolygonWithHoles polygon(hull, holes.begin(), holes.end());
  polygon_coverage_planning::sortVertices(&polygon);
  return polygon;
}

std::vector<std::size_t> topLevelContourPositionsByDescendingArea(
    const std::vector<GridContour>& contours) {
  std::vector<std::size_t> indices = topLevelContourPositions(contours);
  std::sort(indices.begin(), indices.end(),
            [&contours](std::size_t a, std::size_t b) {
              return contours[a].area > contours[b].area;
            });
  return indices;
}

std::vector<GridContour> contourFamilyForTopLevel(
    const std::vector<GridContour>& contours,
    std::size_t top_level_position) {
  if (top_level_position >= contours.size()) {
    throw std::out_of_range("top-level contour position out of range");
  }

  std::vector<GridContour> family;
  family.push_back(contours[top_level_position]);

  const std::vector<GridContour> children =
      directChildContours(contours, contours[top_level_position].original_index);
  family.insert(family.end(), children.begin(), children.end());
  return family;
}

std::vector<PolygonWithHoles> contoursToTopLevelPolygons(
    const std::vector<GridContour>& contours) {
  std::vector<PolygonWithHoles> polygons;
  for (const std::size_t top_level_position :
       topLevelContourPositionsByDescendingArea(contours)) {
    polygons.push_back(contoursToPolygonWithHoles(
        contourFamilyForTopLevel(contours, top_level_position)));
  }
  return polygons;
}

}  // namespace coverage_native
