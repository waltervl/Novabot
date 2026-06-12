cmake_minimum_required(VERSION 3.16)

project(coverage_native LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(ETH_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/eth")
set(ETH_GEOMETRY_ROOT "${ETH_ROOT}/polygon_coverage_geometry")
set(ETH_SOLVERS_ROOT "${ETH_ROOT}/polygon_coverage_solvers")

find_package(CGAL 5.0 REQUIRED COMPONENTS Core)
find_package(OpenCV 4.2 COMPONENTS core imgproc imgcodecs QUIET)
find_package(Python3 REQUIRED COMPONENTS Interpreter)

if(OpenCV_FOUND)
  set(COVERAGE_NATIVE_OPENCV_INCLUDE_DIRS ${OpenCV_INCLUDE_DIRS})
  set(COVERAGE_NATIVE_OPENCV_LIBS ${OpenCV_LIBS})
else()
  find_path(COVERAGE_NATIVE_OPENCV_INCLUDE_DIR
    NAMES opencv2/core.hpp
    PATH_SUFFIXES opencv4
    REQUIRED
  )
  find_library(COVERAGE_NATIVE_OPENCV_CORE opencv_core REQUIRED)
  find_library(COVERAGE_NATIVE_OPENCV_IMGPROC opencv_imgproc REQUIRED)
  find_library(COVERAGE_NATIVE_OPENCV_IMGCODECS opencv_imgcodecs REQUIRED)

  set(COVERAGE_NATIVE_OPENCV_INCLUDE_DIRS
    ${COVERAGE_NATIVE_OPENCV_INCLUDE_DIR}
  )
  set(COVERAGE_NATIVE_OPENCV_LIBS
    ${COVERAGE_NATIVE_OPENCV_IMGCODECS}
    ${COVERAGE_NATIVE_OPENCV_IMGPROC}
    ${COVERAGE_NATIVE_OPENCV_CORE}
  )
  set(OpenCV_VERSION "manual core/imgproc/imgcodecs")
endif()

add_library(coverage_opencv INTERFACE)
target_include_directories(coverage_opencv
  INTERFACE
    ${COVERAGE_NATIVE_OPENCV_INCLUDE_DIRS}
)
target_link_libraries(coverage_opencv
  INTERFACE
    ${COVERAGE_NATIVE_OPENCV_LIBS}
)

message(STATUS "CGAL_VERSION=${CGAL_VERSION}")
message(STATUS "OpenCV_VERSION=${OpenCV_VERSION}")

if(CGAL_USE_FILE)
  include(${CGAL_USE_FILE})
endif()

set(COVERAGE_NATIVE_CGAL_LIBS)
if(TARGET CGAL::CGAL)
  list(APPEND COVERAGE_NATIVE_CGAL_LIBS CGAL::CGAL)
endif()
if(TARGET CGAL::CGAL_Core)
  list(APPEND COVERAGE_NATIVE_CGAL_LIBS CGAL::CGAL_Core)
endif()
list(APPEND COVERAGE_NATIVE_CGAL_LIBS ${CGAL_LIBRARIES} ${CGAL_3RD_PARTY_LIBRARIES})
list(REMOVE_DUPLICATES COVERAGE_NATIVE_CGAL_LIBS)

add_library(coverage_solvers STATIC
  "${ETH_SOLVERS_ROOT}/src/boolean_lattice.cc"
  "${ETH_SOLVERS_ROOT}/src/combinatorics.cc"
)
target_include_directories(coverage_solvers
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/compat"
    "${ETH_SOLVERS_ROOT}/include"
)
target_compile_options(coverage_solvers PRIVATE -Wall)

add_library(coverage_geometry STATIC
  "${ETH_GEOMETRY_ROOT}/src/bcd.cc"
  "${ETH_GEOMETRY_ROOT}/src/boolean.cc"
  "${ETH_GEOMETRY_ROOT}/src/cgal_comm.cc"
  "${ETH_GEOMETRY_ROOT}/src/decomposition.cc"
  "${ETH_GEOMETRY_ROOT}/src/offset.cc"
  "${ETH_GEOMETRY_ROOT}/src/sweep.cc"
  "${ETH_GEOMETRY_ROOT}/src/tcd.cc"
  "${ETH_GEOMETRY_ROOT}/src/triangulation.cc"
  "${ETH_GEOMETRY_ROOT}/src/visibility_graph.cc"
  "${ETH_GEOMETRY_ROOT}/src/visibility_polygon.cc"
  "${ETH_GEOMETRY_ROOT}/src/weakly_monotone.cc"
)
target_include_directories(coverage_geometry
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/compat"
    "${ETH_GEOMETRY_ROOT}/include"
    "${ETH_SOLVERS_ROOT}/include"
)
target_compile_options(coverage_geometry PRIVATE -Wall)
target_link_libraries(coverage_geometry
  PUBLIC
    coverage_solvers
    ${COVERAGE_NATIVE_CGAL_LIBS}
)

add_library(coverage_vendor_glue STATIC
  src/contour_bridge.cc
  src/grid_plan.cc
  src/params.cc
  src/planner.cc
  src/preprocess.cc
  src/tsp.cc
  src/world_convert.cc
  src/world_plan.cc
)
target_include_directories(coverage_vendor_glue
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
    "${ETH_GEOMETRY_ROOT}/include"
)
target_link_libraries(coverage_vendor_glue
  PUBLIC
    coverage_geometry
    coverage_opencv
)
target_compile_options(coverage_vendor_glue PRIVATE -Wall)

add_executable(coverage_smoke src/smoke_bcd_sweep.cc)
target_link_libraries(coverage_smoke
  PRIVATE
    coverage_geometry
    coverage_opencv
)

add_executable(coverage_grid_plan src/coverage_grid_plan_main.cc)
target_link_libraries(coverage_grid_plan
  PRIVATE
    coverage_vendor_glue
    coverage_opencv
)

add_executable(coverage_vendor_glue_test
  tests/test_vendor_glue.cc
)
target_include_directories(coverage_vendor_glue_test
  PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
)
target_link_libraries(coverage_vendor_glue_test
  PRIVATE
    coverage_vendor_glue
    coverage_opencv
)

add_test(NAME coverage_vendor_glue_test COMMAND coverage_vendor_glue_test)
add_test(
  NAME coverage_oracle_exact_subset
  COMMAND
    ${Python3_EXECUTABLE}
    "${CMAKE_CURRENT_SOURCE_DIR}/tests/oracle_replay_demo_auto.py"
    "$<TARGET_FILE:coverage_grid_plan>"
    "${CMAKE_CURRENT_SOURCE_DIR}/oracle"
)
add_test(
  NAME coverage_oracle_full_corpus
  COMMAND
    ${Python3_EXECUTABLE}
    "${CMAKE_CURRENT_SOURCE_DIR}/tests/oracle_full_corpus.py"
    "$<TARGET_FILE:coverage_grid_plan>"
    "${CMAKE_CURRENT_SOURCE_DIR}/oracle"
)
