/*
 * walker_ota.h — OTA update module for the RTK Walker.
 *
 * Polls the OpenNova server for a newer firmware build, downloads it
 * over HTTP/HTTPS, verifies MD5 through `Update.h`, verifies the manifest
 * SHA-256 and ECDSA P-256 signature before finalizing, then reboots. Auto-runs
 * on boot if the
 * `otaAutoCheck` flag is set (default true).
 */
#pragma once
#include <Arduino.h>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "dev"
#endif

struct OtaCheckResult {
    bool ok = false;
    bool updateAvailable = false;
    String currentVersion;
    String latestVersion;
    String url;
    String md5;
    String sha256;
    size_t size = 0;
    String signature;
    String keyId;
    String error;
};

OtaCheckResult walkerOtaCheck();

// Downloads + applies the firmware. Reboots on success.
// progressCb may be nullptr. outErr set on any failure.
bool walkerOtaApply(const String& url, const String& expectedMd5,
                    const String& expectedSha256, size_t expectedSize,
                    const String& version, const String& signature,
                    const String& keyId,
                    void (*progressCb)(int pct), String& outErr);

// Check + apply if updateAvailable. force=true bypasses the otaAutoCheck flag.
void walkerOtaAutoTick(bool force);

const char* walkerFirmwareVersion();
