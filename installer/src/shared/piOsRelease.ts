// Always-latest Raspberry Pi OS Lite 64-bit.
//
// `latestUrl` is the official `_latest` endpoint, which 302-redirects to the
// current dated `.img.xz`. We resolve that redirect at download time and verify
// integrity against the per-image `.img.xz.sha256` sidecar published next to it
// (fetched over HTTPS). There is therefore NO pinned hash to bump and no need to
// cut a new installer release every time Raspberry Pi publishes a new image.
export const PI_OS_RELEASE = {
  latestUrl: 'https://downloads.raspberrypi.com/raspios_lite_arm64_latest',
  displayName: 'Raspberry Pi OS Lite (64-bit, latest)',
} as const;
