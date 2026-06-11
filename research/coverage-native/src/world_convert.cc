#include "coverage_native/world_convert.h"

#include <stdexcept>

namespace coverage_native {

WorldPoint mapToWorld(unsigned int mx, unsigned int my,
                      const MapMetadata& metadata) {
  if (metadata.width == 0 || metadata.height == 0) {
    throw std::invalid_argument("map dimensions must be non-zero");
  }
  if (metadata.resolution <= 0.0) {
    throw std::invalid_argument("map resolution must be positive");
  }
  if (mx >= metadata.width || my >= metadata.height) {
    throw std::out_of_range("map coordinate outside metadata bounds");
  }

  const unsigned int flipped_y = metadata.height - 1 - my;
  return {
      metadata.origin_x + (static_cast<double>(mx) + 0.5) * metadata.resolution,
      metadata.origin_y +
          (static_cast<double>(flipped_y) + 0.5) * metadata.resolution,
  };
}

}  // namespace coverage_native
