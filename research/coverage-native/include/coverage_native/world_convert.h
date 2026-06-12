#pragma once

namespace coverage_native {

struct MapMetadata {
  unsigned int width;
  unsigned int height;
  double resolution;
  double origin_x;
  double origin_y;
};

struct WorldPoint {
  double x;
  double y;
};

WorldPoint mapToWorld(unsigned int mx, unsigned int my,
                      const MapMetadata& metadata);

}  // namespace coverage_native
