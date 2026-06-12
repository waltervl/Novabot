# ── Stage 0: Node runtime copied into Ubuntu 20.04 stages ────────────────────
FROM node:20-bullseye-slim AS node-runtime


# ── Stage 1: Native coverage planner (CGAL 5.0.3 + OpenCV 4.2) ───────────────
FROM ubuntu:20.04 AS coverage-native

ARG DEBIAN_FRONTEND=noninteractive
ARG CGAL_VERSION=5.0.3

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    libboost-all-dev \
    libgmp-dev \
    libmpfr-dev \
    libopencv-core-dev \
    libopencv-imgcodecs-dev \
    libopencv-imgproc-dev \
    ninja-build \
    pkg-config \
    wget \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN wget -q -O "cgal-${CGAL_VERSION}.tar.gz" "https://github.com/CGAL/cgal/archive/refs/tags/v${CGAL_VERSION}.tar.gz" \
  && tar -xf "cgal-${CGAL_VERSION}.tar.gz" \
  && cmake -S "cgal-${CGAL_VERSION}" -B cgal-build \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="/opt/cgal-${CGAL_VERSION}" \
    -DWITH_CGAL_Qt5=OFF \
  && cmake --build cgal-build --target install --parallel \
  && rm -rf "cgal-${CGAL_VERSION}" "cgal-${CGAL_VERSION}.tar.gz" cgal-build

ENV CMAKE_PREFIX_PATH="/opt/cgal-${CGAL_VERSION}"

WORKDIR /coverage-native
COPY research/coverage-native/ ./

RUN cmake -S /coverage-native -B /coverage-native/build -G Ninja -DCMAKE_BUILD_TYPE=Release \
  && cmake --build /coverage-native/build --parallel \
  && cd /coverage-native/build \
  && ctest --output-on-failure \
  && ./coverage_smoke


# ── Stage 2: Build (TypeScript compilatie) ───────────────────────────────────
FROM ubuntu:20.04 AS build

ARG DEBIAN_FRONTEND=noninteractive

COPY --from=node-runtime /usr/local /usr/local

# Build tools for native modules (bcrypt, better-sqlite3)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    linux-libc-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server dependencies first (cache layer)
COPY server/package.json server/package-lock.json* server/
RUN cd server && npm ci

# Install dashboard dependencies
COPY dashboard/package.json dashboard/package-lock.json* dashboard/
RUN cd dashboard && npm ci

# Copy source and build server
COPY server/src server/src
COPY server/tsconfig.json server/
RUN cd server && npm run build

# Copy source and build dashboard
COPY dashboard/src dashboard/src
COPY dashboard/tsconfig.json dashboard/tsconfig.app.json dashboard/tsconfig.node.json dashboard/
COPY dashboard/vite.config.ts dashboard/
COPY dashboard/index.html dashboard/
COPY dashboard/public dashboard/public
RUN cd dashboard && npm run build


# ── Stage 3: Production dependencies (lean) ──────────────────────────────────
FROM ubuntu:20.04 AS deps

ARG DEBIAN_FRONTEND=noninteractive

COPY --from=node-runtime /usr/local /usr/local

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    linux-libc-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json* server/

# Install production deps only (no typescript, tsx, @types, etc.)
RUN cd server && npm ci --omit=dev

# Remove packages not needed in Docker:
# - @stoprocent/noble + usb + @serialport = BLE (no adapter in Docker)
# - ssh2 + cpu-features = SSH to mower (dev-only feature)
# All imports are dynamic — server runs fine without them.
RUN cd server && \
    rm -rf node_modules/@stoprocent \
           node_modules/noble \
           node_modules/usb \
           node_modules/@serialport \
           node_modules/serialport \
           node_modules/ssh2 \
           node_modules/cpu-features \
           node_modules/@noble

# Strip better-sqlite3: remove build artifacts not needed at runtime
# The .node binary in build/Release is needed; deps/ and src/ are not.
RUN cd server/node_modules/better-sqlite3 && \
    rm -rf deps src build/deps build/test_extension* build/*.mk build/Makefile \
           build/config.gypi build/gyp-mac-tool build/binding.Makefile 2>/dev/null; true


# ── Stage 4: Runtime ─────────────────────────────────────────────────────────
FROM ubuntu:20.04

ARG DEBIAN_FRONTEND=noninteractive

COPY --from=node-runtime /usr/local /usr/local

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    dnsmasq \
    libgmp10 \
    libmpfr6 \
    libopencv-core4.2 \
    libopencv-imgcodecs4.2 \
    libopencv-imgproc4.2 \
    nginx \
    openssh-client \
    openssl \
    sqlite3 \
    sshpass \
    tzdata \
    zip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled server + lean production dependencies
COPY --from=build /app/server/dist server/dist
COPY --from=deps /app/server/node_modules server/node_modules
COPY --from=deps /app/server/package.json server/

# Copy built dashboard
COPY --from=build /app/dashboard/dist dashboard/dist

# Copy static assets (logo, etc.)
COPY server/public server/public

# Copy factory device database (SN → MAC lookup for BLE provisioning)
COPY server/cloud_devices_anonymous.json server/cloud_devices_anonymous.json

# Copy native coverage planner built from open-source CGAL/ETH + vendor glue.
COPY --from=coverage-native /coverage-native/build/coverage_grid_plan /opt/opennova/bin/coverage_grid_plan
RUN chmod +x /opt/opennova/bin/coverage_grid_plan \
  && mkdir -p /opt/opennova/share/licenses/coverage-native
COPY research/coverage-native/eth/LICENSE /opt/opennova/share/licenses/coverage-native/GPL-3.0.txt
COPY research/coverage-native/THIRD_PARTY_NOTICES.md /opt/opennova/share/licenses/coverage-native/THIRD_PARTY_NOTICES.md
ENV COVERAGE_NATIVE_BIN=/opt/opennova/bin/coverage_grid_plan

# Copy entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Persistent data directory
RUN mkdir -p /data/storage /data/firmware

# Ports: DNS, HTTP, HTTPS (app), MQTT, API+Dashboard
EXPOSE 53/udp 53/tcp 80 443 1883 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
