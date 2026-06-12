#!/bin/bash
# Build and push the heavyweight native coverage planner artifact image.
# Normal OpenNova builds consume this image and do not compile CGAL/planner.
set -euo pipefail

cd "$(dirname "$0")/.."

BUILDER="${BUILDER:-multiplatform-builder}"
IMAGE="${COVERAGE_NATIVE_IMAGE:-rvbcrs/opennova-coverage-native}"
TAG="${COVERAGE_NATIVE_TAG:-${1:-latest}}"
COVERAGE_NATIVE_BUILD_JOBS="${COVERAGE_NATIVE_BUILD_JOBS:-1}"

BUILD_ARGS=(
  buildx build
  --platform linux/amd64,linux/arm64
  --builder "$BUILDER"
  --build-arg "COVERAGE_NATIVE_BUILD_JOBS=$COVERAGE_NATIVE_BUILD_JOBS"
  -f research/coverage-native/Dockerfile.build
  -t "$IMAGE:$TAG"
  --push
)

if [ "${COVERAGE_NATIVE_NO_CACHE:-0}" = "1" ] || [ "${COVERAGE_NATIVE_NO_CACHE:-}" = "true" ]; then
  BUILD_ARGS+=(--no-cache)
fi

BUILD_ARGS+=(research/coverage-native)

docker "${BUILD_ARGS[@]}"
