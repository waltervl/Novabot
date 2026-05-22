/*
 * walker_ota.cpp — OTA implementation.
 *
 * Flow:
 *   walkerOtaCheck()  GETs <serverUrl>/api/walker-firmware/latest?currentVersion=<v>
 *                     and returns the parsed manifest.
 *   walkerOtaApply()  GETs the firmware URL with no auth (LAN-only public endpoint),
 *                     streams it through Update.write() and reboots on success.
 *   walkerOtaAutoTick(force) runs both, respecting the `otaAutoCheck` flag unless
 *                     `force` is true.
 *
 * The module compiles unconditionally in both PlatformIO envs. At runtime
 * Update.h only succeeds when the partition table includes a second app
 * slot (true for jc3248w535-walker via default_16MB.csv-style layouts;
 * not for huge_app.csv targets, where Update.begin() will fail cleanly).
 */
#include "walker_ota.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>

#include "walker_api.h"

const char* walkerFirmwareVersion() { return FIRMWARE_VERSION; }

OtaCheckResult walkerOtaCheck() {
    OtaCheckResult r;
    r.currentVersion = FIRMWARE_VERSION;

    WalkerConfigView cfg;
    walkerGetConfig(cfg);

    if (cfg.serverUrl.length() == 0) {
        r.ok = false;
        r.error = "server URL not configured";
        return r;
    }

    if (WiFi.status() != WL_CONNECTED) {
        r.ok = false;
        r.error = "wifi not connected";
        return r;
    }

    String url = cfg.serverUrl;
    if (!url.endsWith("/")) url += "/";
    url += "api/walker-firmware/latest?currentVersion=";
    url += FIRMWARE_VERSION;

    HTTPClient http;
    http.setTimeout(30000);
    if (!http.begin(url)) {
        r.error = "http begin failed";
        return r;
    }

    int code = http.GET();
    if (code != 200) {
        r.error = "HTTP " + String(code);
        http.end();
        return r;
    }

    String body = http.getString();
    http.end();

    StaticJsonDocument<512> doc;
    DeserializationError jerr = deserializeJson(doc, body);
    if (jerr) {
        r.error = "manifest parse failed";
        return r;
    }

    r.ok = true;
    r.updateAvailable = doc["updateAvailable"] | false;
    r.latestVersion   = (const char*) (doc["version"] | "");
    r.url             = (const char*) (doc["url"] | "");
    r.md5             = (const char*) (doc["md5"] | "");
    return r;
}

bool walkerOtaApply(const String& url, const String& expectedMd5,
                    void (*progressCb)(int pct), String& outErr) {
    // Binary endpoint is mounted publicly on the server (LAN-only) — no
    // Authorization header needed. cfg lookup kept in case future flows
    // want to inject one again, but we no longer require any token.
    HTTPClient http;
    http.setTimeout(60000);
    if (!http.begin(url)) {
        outErr = "http begin failed";
        return false;
    }

    int code = http.GET();
    if (code != 200) {
        outErr = "HTTP " + String(code);
        http.end();
        return false;
    }

    int len = http.getSize();
    if (len <= 0) {
        outErr = "no content-length";
        http.end();
        return false;
    }

    if (!Update.begin(len)) {
        outErr = Update.errorString();
        http.end();
        return false;
    }
    if (expectedMd5.length() > 0) {
        Update.setMD5(expectedMd5.c_str());
    }

    WiFiClient* stream = http.getStreamPtr();
    uint8_t buf[1024];
    int written = 0;
    int lastPct = -1;
    while (written < len) {
        if (!stream->available()) {
            // Brief yield; HTTPClient socket can hiccup mid-stream.
            delay(1);
            continue;
        }
        int n = stream->readBytes(buf, sizeof(buf));
        if (n <= 0) {
            delay(1);
            continue;
        }
        if (Update.write(buf, n) != (size_t) n) {
            outErr = Update.errorString();
            Update.abort();
            http.end();
            return false;
        }
        written += n;
        if (progressCb) {
            int pct = (int) ((written * 100LL) / len);
            if (pct != lastPct) {
                progressCb(pct);
                lastPct = pct;
            }
        }
    }

    if (!Update.end(true)) {
        outErr = Update.errorString();
        http.end();
        return false;
    }
    http.end();

    Serial.println("[ota] applied, rebooting...");
    delay(500);
    ESP.restart();
    return true;  // unreachable
}

void walkerOtaAutoTick(bool force) {
    WalkerConfigView cfg;
    walkerGetConfig(cfg);
    if (!force && !cfg.otaAutoCheck) return;

    OtaCheckResult r = walkerOtaCheck();
    Serial.printf("[ota] check: ok=%d avail=%d cur=%s latest=%s err=%s\n",
                  (int) r.ok, (int) r.updateAvailable,
                  r.currentVersion.c_str(), r.latestVersion.c_str(),
                  r.error.c_str());

    if (r.ok && r.updateAvailable) {
        String err;
        if (!walkerOtaApply(r.url, r.md5, nullptr, err)) {
            Serial.printf("[ota] apply failed: %s\n", err.c_str());
        }
    }
}
