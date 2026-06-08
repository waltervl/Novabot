// Pinned, known-good Raspberry Pi OS Lite 64-bit. Bump deliberately + update sha256.
// NOTE: the url + sha256 below are PLACEHOLDERS — set the real pinned values when
// wiring up real flashing (verify against the live Raspberry Pi downloads page).
export const PI_OS_RELEASE = {
  url: 'https://downloads.raspberrypi.com/raspios_lite_arm64/images/RASPIOS_LITE_ARM64_PINNED.img.xz',
  sha256: 'PINNED_SHA256_TO_FILL_AT_IMPLEMENTATION',
  displayName: 'Raspberry Pi OS Lite (64-bit)',
} as const;
