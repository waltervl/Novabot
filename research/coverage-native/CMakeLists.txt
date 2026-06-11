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
find_package(OpenCV 4.2 REQUIRED COMPONENTS core imgproc imgcodecs)

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
  src/params.cc
  src/planner.cc
  src/preprocess.cc
  src/tsp.cc
  src/world_convert.cc
)
target_include_directories(coverage_vendor_glue
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
    "${ETH_GEOMETRY_ROOT}/include"
)
target_link_libraries(coverage_vendor_glue
  PUBLIC
    coverage_geometry
    ${OpenCV_LIBS}
)
target_compile_options(coverage_vendor_glue PRIVATE -Wall)

add_executable(coverage_smoke src/smoke_bcd_sweep.cc)
target_link_libraries(coverage_smoke
  PRIVATE
    coverage_geometry
    ${OpenCV_LIBS}
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
    ${OpenCV_LIBS}
)

add_test(NAME coverage_vendor_glue_test COMMAND coverage_vendor_glue_test)
