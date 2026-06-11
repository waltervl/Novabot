#include <cstdlib>
#include <exception>
#include <iostream>
#include <string>

#include <opencv2/imgcodecs.hpp>

#include "coverage_native/grid_plan.h"

namespace {

void printUsage(const char* argv0) {
  std::cerr << "usage: " << argv0 << " <pgm> <startX> <startY> [covDir]\n";
}

void printPlanJson(const coverage_native::CellPathMap& plan) {
  std::cout << "{\n";
  bool first_cell = true;
  for (const auto& cell : plan) {
    if (!first_cell) {
      std::cout << ",\n";
    }
    first_cell = false;

    std::cout << "  \"" << cell.first << "\": \"";
    bool first_point = true;
    for (const coverage_native::GridPoint& point : cell.second) {
      if (!first_point) {
        std::cout << ",";
      }
      first_point = false;
      std::cout << point.x << " " << point.y;
    }
    std::cout << "\"";
  }
  std::cout << "\n}\n";
}

std::size_t countVertices(const coverage_native::CellPathMap& plan) {
  std::size_t count = 0;
  for (const auto& cell : plan) {
    count += cell.second.size();
  }
  return count;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 4 || argc > 5) {
    printUsage(argv[0]);
    return EXIT_FAILURE;
  }

  try {
    const std::string pgm_path = argv[1];
    const int start_x = std::stoi(argv[2]);
    const int start_y = std::stoi(argv[3]);

    coverage_native::GridPlanOptions options;
    if (argc == 5) {
      options.decomposition.specify_direction = true;
      options.decomposition.coverage_direction_degrees =
          static_cast<unsigned char>(std::stoi(argv[4]));
    }

    const cv::Mat map = cv::imread(pgm_path, cv::IMREAD_GRAYSCALE);
    if (map.empty()) {
      std::cerr << "failed to read pgm: " << pgm_path << "\n";
      return EXIT_FAILURE;
    }

    const coverage_native::CellPathMap plan =
        coverage_native::generateCoverageGridPlan(
            map, coverage_native::GridPoint{start_x, start_y}, options);

    printPlanJson(plan);
    std::cerr << "cells=" << plan.size() << " verts=" << countVertices(plan)
              << " start=(" << start_x << "," << start_y << ")"
              << " specifyDir="
              << static_cast<int>(options.decomposition.specify_direction)
              << " covDir="
              << static_cast<int>(
                     options.decomposition.coverage_direction_degrees)
              << "\n";
  } catch (const std::exception& e) {
    std::cerr << "coverage_grid_plan: " << e.what() << "\n";
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
