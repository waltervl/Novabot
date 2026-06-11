#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

#include "coverage_native/contour_bridge.h"
#include "coverage_native/grid_plan.h"
#include "coverage_native/params.h"
#include "coverage_native/planner.h"
#include "coverage_native/preprocess.h"
#include "coverage_native/tsp.h"
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
  require(params.obstacle_open_iterations == 2,
          "obstacle open iterations must match vendor call");
  require(params.coverage_open_iterations == 2,
          "coverage open iterations must match vendor call");
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
  const coverage_native::CoverageParameters params =
      coverage_native::makeCoverageParametersFromMeters(0.05);

  cv::Mat unknown(31, 31, CV_8UC1, cv::Scalar(205));
  cv::Mat unknown_blocked =
      coverage_native::preprocessMap(unknown, unknown, params);
  require(cv::countNonZero(unknown_blocked) == 0,
          "unknown pixels must be blocked by default");

  cv::Mat obstacle(31, 31, CV_8UC1, cv::Scalar(255));
  cv::Mat coverage(31, 31, CV_8UC1, cv::Scalar(0));
  coverage(cv::Rect(10, 10, 11, 11)).setTo(255);

  const cv::Mat preprocessed = coverage_native::preprocessMap(
      obstacle, coverage, params);
  const cv::Mat preprocessed_obstacle =
      coverage_native::preprocessObstacleMap(obstacle, params);

  require(preprocessed.type() == CV_8UC1, "preprocess output must be CV_8UC1");
  require(preprocessed.rows == 31 && preprocessed.cols == 31,
          "preprocess output size must match input");
  require(cv::countNonZero(preprocessed_obstacle) == 31 * 31,
          "single-map obstacle preprocessing keeps an all-free map free");

  require(cv::countNonZero(preprocessed) > 0,
          "coverage preprocessing keeps viable interior pixels");
  require(preprocessed.at<unsigned char>(15, 15) == 255,
          "coverage preprocessing keeps the rectangle center free");
  require(preprocessed.at<unsigned char>(10, 10) == 0,
          "coverage preprocessing removes rectangle corners");
  require(preprocessed.at<unsigned char>(10, 11) == 0,
          "coverage preprocessing erodes rectangle edges");
  require(preprocessed.at<unsigned char>(5, 5) == 0,
          "coverage preprocessing keeps outside pixels blocked");
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

void testContourExtractionFiltersSmallAreas() {
  cv::Mat map(80, 80, CV_8UC1, cv::Scalar(0));
  cv::rectangle(map, cv::Rect(5, 5, 20, 20), cv::Scalar(255), cv::FILLED);
  cv::rectangle(map, cv::Rect(50, 50, 5, 5), cv::Scalar(255), cv::FILLED);

  const std::vector<coverage_native::GridContour> contours =
      coverage_native::findCoverageContours(map);

  require(contours.size() == 1, "only contours with area > 200 survive");
  require(contours[0].area > 200.0, "surviving contour area");
  require(contours[0].original_index >= 0,
          "surviving contour keeps discovery index");
}

void testContoursConvertToPolygonWithHole() {
  cv::Mat map(90, 90, CV_8UC1, cv::Scalar(0));
  cv::rectangle(map, cv::Rect(10, 10, 60, 60), cv::Scalar(255), cv::FILLED);
  cv::rectangle(map, cv::Rect(30, 30, 22, 22), cv::Scalar(0), cv::FILLED);

  const std::vector<coverage_native::GridContour> contours =
      coverage_native::findCoverageContours(map);
  require(contours.size() == 2, "outer contour and hole must survive");

  const PolygonWithHoles polygon =
      coverage_native::contoursToPolygonWithHoles(contours);

  require(polygon.outer_boundary().size() == 4,
          "axis-aligned outer contour simplifies to four vertices");
  require(std::distance(polygon.holes_begin(), polygon.holes_end()) == 1,
          "inner contour becomes one hole");
  require(polygon.holes_begin()->size() == 4,
          "axis-aligned hole simplifies to four vertices");
}

void testDecompositionAndSweeps() {
  cv::Mat map(90, 90, CV_8UC1, cv::Scalar(0));
  cv::rectangle(map, cv::Rect(10, 10, 60, 60), cv::Scalar(255), cv::FILLED);

  const PolygonWithHoles polygon = coverage_native::contoursToPolygonWithHoles(
      coverage_native::findCoverageContours(map));

  const std::vector<Polygon_2> auto_cells =
      coverage_native::decomposeCoveragePolygon(
          polygon, coverage_native::DecompositionOptions{});
  require(auto_cells.size() == 1, "simple rectangle decomposes to one cell");

  const std::vector<Polygon_2> directed_cells =
      coverage_native::decomposeCoveragePolygon(
          polygon, coverage_native::DecompositionOptions{true, 0});
  require(directed_cells.size() == 1,
          "specified-direction rectangle decomposes to one cell");

  const std::vector<std::vector<std::vector<Point_2>>> sweeps =
      coverage_native::computeSweepsForCells(auto_cells, 3.0);
  require(sweeps.size() == 1, "one cell returns one sweep-set collection");
  require(!sweeps[0].empty(), "cell has at least one sweep candidate");
  require(!sweeps[0][0].empty(), "sweep candidate contains waypoints");
}

void testVendorSweepSkipsSyntheticFinalMidpoint() {
  Polygon_2 cell;
  cell.push_back(Point_2(0, 0));
  cell.push_back(Point_2(20, 0));
  cell.push_back(Point_2(20, 10));
  cell.push_back(Point_2(0, 5));
  if (!cell.is_counterclockwise_oriented()) {
    cell.reverse_orientation();
  }

  coverage_native::DecompositionResult decomposition;
  decomposition.cells.push_back(cell);

  const std::vector<std::vector<Point_2>> sweeps =
      coverage_native::computeVendorSweepsForCells(
          decomposition, 3.0, coverage_native::DecompositionOptions{true, 0});
  require(sweeps.size() == 1, "single synthetic cell returns one sweep");

  const std::vector<Point_2>& sweep = sweeps.front();
  require(sweep.size() == 9,
          "vendor final sweep falls back to final vertex line without midpoint");
  requireNear(CGAL::to_double(sweep[6].x()), 20.0, 1e-9,
              "pre-final sweep source x");
  requireNear(CGAL::to_double(sweep[6].y()), 9.0, 1e-9,
              "pre-final sweep source y");
  requireNear(CGAL::to_double(sweep[7].x()), 16.0, 1e-9,
              "pre-final sweep target x");
  requireNear(CGAL::to_double(sweep[7].y()), 9.0, 1e-9,
              "pre-final sweep target y");
  requireNear(CGAL::to_double(sweep[8].x()), 20.0, 1e-9,
              "final vertex sweep x");
  requireNear(CGAL::to_double(sweep[8].y()), 10.0, 1e-9,
              "final vertex sweep y");
}

void testPathAssessmentAndCellOrdering() {
  const coverage_native::GridPath path = {
      {0, 0},
      {3, 4},
      {6, 4},
  };

  requireNear(coverage_native::calculatePathLength(path), 8.0, 1e-9,
              "path length sums euclidean segments");
  require(coverage_native::calculateRotations(path) == 3,
          "rotation proxy is waypoint count");

  coverage_native::CellPathMap paths;
  paths.emplace(0, path);
  requireNear(coverage_native::pathAssessFunction(paths), 6.8875, 1e-9,
              "path assessment matches recovered vendor weights");

  std::vector<coverage_native::GridContour> contours = {
      {{cv::Point(0, 0), cv::Point(1, 0), cv::Point(0, 1)}, 10.0, 7},
      {{cv::Point(0, 0), cv::Point(5, 0), cv::Point(0, 5)}, 50.0, 8},
      {{cv::Point(0, 0), cv::Point(3, 0), cv::Point(0, 3)}, 20.0, 9},
  };

  const std::vector<int> ordered =
      coverage_native::orderContourIndicesByDescendingArea(contours);
  require(ordered.size() == 3, "all contours must be ordered");
  require(ordered[0] == 8 && ordered[1] == 9 && ordered[2] == 7,
          "cell order is descending contour area");
}

void testGenerateCoverageGridPlanForSimpleMap() {
  cv::Mat map(90, 90, CV_8UC1, cv::Scalar(0));
  cv::rectangle(map, cv::Rect(10, 10, 60, 60), cv::Scalar(255), cv::FILLED);

  const coverage_native::CellPathMap plan =
      coverage_native::generateCoverageGridPlan(
          map, coverage_native::GridPoint{15, 15},
          coverage_native::GridPlanOptions{});

  require(plan.size() == 1, "simple map generates one planned cell");
  require(!plan.begin()->second.empty(), "planned cell contains grid points");
}

}  // namespace

int main() {
  try {
    testCoverageParametersFromMeters();
    testCoverageParametersFromPixels();
    testPreprocessMap();
    testWorldTransform();
    testContourExtractionFiltersSmallAreas();
    testContoursConvertToPolygonWithHole();
    testDecompositionAndSweeps();
    testVendorSweepSkipsSyntheticFinalMidpoint();
    testPathAssessmentAndCellOrdering();
    testGenerateCoverageGridPlanForSimpleMap();
  } catch (const std::exception& e) {
    std::cerr << "coverage_vendor_glue_test: " << e.what() << "\n";
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
