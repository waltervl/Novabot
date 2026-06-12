#include <cstdlib>
#include <exception>
#include <iostream>
#include <optional>
#include <string>

#include <opencv2/imgcodecs.hpp>

#include "coverage_native/grid_plan.h"
#include "coverage_native/world_plan.h"

namespace {

void printUsage(const char* argv0) {
  std::cerr << "usage: " << argv0
            << " <pgm> <startX> <startY> [covDir]"
            << " [--inflation meters]"
            << " [--world width height resolution originX originY [areaId]]\n";
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

struct CliOptions {
  std::string pgm_path;
  int start_x;
  int start_y;
  coverage_native::GridPlanOptions plan_options;
  std::optional<coverage_native::MapMetadata> metadata;
  std::optional<double> inflation_radius_m;
  int area_id = 1;
};

CliOptions parseArgs(int argc, char** argv) {
  if (argc < 4) {
    throw std::invalid_argument("missing required arguments");
  }

  CliOptions options{
      argv[1],
      std::stoi(argv[2]),
      std::stoi(argv[3]),
      coverage_native::GridPlanOptions{},
      std::nullopt,
      std::nullopt,
      1,
  };

  int index = 4;
  if (index < argc && std::string(argv[index]).rfind("--", 0) != 0) {
    options.plan_options.decomposition.specify_direction = true;
    options.plan_options.decomposition.coverage_direction_degrees =
        static_cast<unsigned char>(std::stoi(argv[index]));
    ++index;
  }

  if (index < argc) {
    while (index < argc) {
      const std::string flag(argv[index]);
      if (flag == "--inflation") {
        if (index + 1 >= argc) {
          throw std::invalid_argument("--inflation expects meters");
        }
        options.inflation_radius_m = std::stod(argv[index + 1]);
        index += 2;
        continue;
      }
      if (flag == "--world") {
        if (argc - index != 6 && argc - index != 7) {
          throw std::invalid_argument(
              "--world expects width height resolution originX originY [areaId]");
        }
        options.metadata = coverage_native::MapMetadata{
            static_cast<unsigned int>(std::stoul(argv[index + 1])),
            static_cast<unsigned int>(std::stoul(argv[index + 2])),
            std::stod(argv[index + 3]),
            std::stod(argv[index + 4]),
            std::stod(argv[index + 5]),
        };
        if (argc - index == 7) {
          options.area_id = std::stoi(argv[index + 6]);
        }
        index = argc;
        continue;
      }
      throw std::invalid_argument("unexpected argument: " +
                                  flag);
    }
  }

  if (options.inflation_radius_m.has_value()) {
    const double resolution =
        options.metadata.has_value() ? options.metadata->resolution : 0.05;
    options.plan_options.parameters = coverage_native::makeCoverageParametersFromMeters(
        resolution, *options.inflation_radius_m);
  }

  return options;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 4) {
    printUsage(argv[0]);
    return EXIT_FAILURE;
  }

  try {
    const CliOptions cli = parseArgs(argc, argv);

    const cv::Mat map = cv::imread(cli.pgm_path, cv::IMREAD_GRAYSCALE);
    if (map.empty()) {
      std::cerr << "failed to read pgm: " << cli.pgm_path << "\n";
      return EXIT_FAILURE;
    }

    const coverage_native::CellPathMap plan =
        coverage_native::generateCoverageGridPlan(
            map, coverage_native::GridPoint{cli.start_x, cli.start_y},
            cli.plan_options);

    if (cli.metadata.has_value()) {
      std::cout << coverage_native::plannedPathJson(
          coverage_native::gridPlanToWorldPlan(plan, *cli.metadata),
          cli.area_id);
    } else {
      printPlanJson(plan);
    }
    std::cerr << "cells=" << plan.size() << " verts=" << countVertices(plan)
              << " start=(" << cli.start_x << "," << cli.start_y << ")"
              << " specifyDir="
              << static_cast<int>(
                     cli.plan_options.decomposition.specify_direction)
              << " covDir="
              << static_cast<int>(
                     cli.plan_options.decomposition.coverage_direction_degrees)
              << " inflationPx="
              << cli.plan_options.parameters.obstacle_inflation_px
              << "\n";
  } catch (const std::exception& e) {
    std::cerr << "coverage_grid_plan: " << e.what() << "\n";
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
