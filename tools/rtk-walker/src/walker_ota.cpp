/*
 * walker_ota.cpp — OTA implementation.
 *
 * Flow:
 *   walkerOtaCheck()  GETs <serverUrl>/api/walker-firmware/latest?currentVersion=<v>
 *                     and returns the parsed manifest.
 *   walkerOtaApply()  GETs the firmware URL over HTTP/HTTPS, requires signed
 *                     manifest metadata, streams through Update.write(),
 *                     verifies SHA-256 + ECDSA before finalizing, reboots.
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
#include <WiFiClientSecure.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <cstring>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>

#include "walker_api.h"

const char* walkerFirmwareVersion() { return FIRMWARE_VERSION; }

namespace {

const char* kWalkerOtaSigningKeyId = "walker-p256-2026-01";

// Development/test public key only. Replace this PEM and kWalkerOtaSigningKeyId
// with the production public key before shipping signed public releases.
const char kWalkerOtaPublicKeyPem[] =
"-----BEGIN PUBLIC KEY-----\n"
"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAENZscH37tN3r/cf4xyJ8roAY+ovPM\n"
"ESuuZldCF568dhoZ7/VzyFpCYI9nbcrYgCMnNIR0uBwMKC655hP08WD81Q==\n"
"-----END PUBLIC KEY-----\n";

bool isHexDigest(const String& s, size_t len) {
    if (s.length() != len) return false;
    for (size_t i = 0; i < s.length(); i++) {
        char c = s[i];
        bool ok = (c >= '0' && c <= '9') ||
                  (c >= 'a' && c <= 'f') ||
                  (c >= 'A' && c <= 'F');
        if (!ok) return false;
    }
    return true;
}

String lowerHex(const String& s) {
    String out = s;
    out.toLowerCase();
    return out;
}

String bytesToHex(const uint8_t* bytes, size_t len) {
    static const char* hex = "0123456789abcdef";
    String out;
    out.reserve(len * 2);
    for (size_t i = 0; i < len; i++) {
        out += hex[(bytes[i] >> 4) & 0x0f];
        out += hex[bytes[i] & 0x0f];
    }
    return out;
}

String canonicalOtaPayload(const String& version, size_t size, const String& sha256) {
    String payload;
    payload.reserve(120 + version.length() + sha256.length());
    payload += "walker-ota-v1\n";
    payload += "device_type=walker\n";
    payload += "version=";
    payload += version;
    payload += "\n";
    payload += "size=";
    payload += String((unsigned long) size);
    payload += "\n";
    payload += "sha256=";
    payload += lowerHex(sha256);
    payload += "\n";
    return payload;
}

bool verifyOtaSignature(const String& version, size_t size, const String& sha256,
                        const String& signatureB64, const String& keyId,
                        String& outErr) {
    if (keyId.length() > 0 && keyId != kWalkerOtaSigningKeyId) {
        outErr = "unsupported signing key";
        return false;
    }

    uint8_t signatureDer[160];
    size_t signatureLen = 0;
    int rc = mbedtls_base64_decode(
        signatureDer, sizeof(signatureDer), &signatureLen,
        reinterpret_cast<const unsigned char*>(signatureB64.c_str()),
        signatureB64.length());
    if (rc != 0 || signatureLen == 0) {
        outErr = "signature base64 invalid";
        return false;
    }

    String payload = canonicalOtaPayload(version, size, sha256);
    uint8_t payloadHash[32];
    const mbedtls_md_info_t* shaInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!shaInfo || mbedtls_md(shaInfo,
                               reinterpret_cast<const unsigned char*>(payload.c_str()),
                               payload.length(),
                               payloadHash) != 0) {
        outErr = "signature payload hash failed";
        return false;
    }

    mbedtls_pk_context pk;
    mbedtls_pk_init(&pk);
    rc = mbedtls_pk_parse_public_key(
        &pk,
        reinterpret_cast<const unsigned char*>(kWalkerOtaPublicKeyPem),
        strlen(kWalkerOtaPublicKeyPem) + 1);
    if (rc != 0) {
        mbedtls_pk_free(&pk);
        outErr = "public key parse failed";
        return false;
    }

    rc = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256,
                           payloadHash, sizeof(payloadHash),
                           signatureDer, signatureLen);
    mbedtls_pk_free(&pk);
    if (rc != 0) {
        outErr = "signature verify failed";
        return false;
    }
    return true;
}

bool beginHttp(HTTPClient& http, const String& url,
               WiFiClient& plainClient, WiFiClientSecure& tlsClient) {
    if (url.startsWith("https://")) {
        // The walker has no provisioned CA bundle yet. Prefer HTTPS transport
        // when the server offers it, but use setInsecure() as the pragmatic
        // fallback until certificate pinning/signing is added.
        tlsClient.setInsecure();
        tlsClient.setTimeout(30);
        return http.begin(tlsClient, url);
    }
    return http.begin(plainClient, url);
}

}  // namespace

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
    WiFiClient plainClient;
    WiFiClientSecure tlsClient;
    http.setTimeout(30000);
    if (!beginHttp(http, url, plainClient, tlsClient)) {
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

    StaticJsonDocument<2048> doc;
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
    r.sha256          = (const char*) (doc["sha256"] | "");
    r.size            = (size_t) (doc["size"] | 0);
    r.signature       = (const char*) (doc["signature"] | "");
    const char* keyId = (const char*) (doc["keyId"] | "");
    if (!keyId || keyId[0] == '\0') keyId = (const char*) (doc["signingKeyId"] | "");
    r.keyId           = keyId ? keyId : "";
    if (r.updateAvailable && r.url.length() == 0) {
        r.ok = false;
        r.error = "manifest missing url";
    } else if (r.updateAvailable && !isHexDigest(r.md5, 32)) {
        r.ok = false;
        r.error = "manifest missing valid md5";
    } else if (r.updateAvailable && !isHexDigest(r.sha256, 64)) {
        r.ok = false;
        r.error = "manifest missing valid sha256";
    } else if (r.updateAvailable && r.size == 0) {
        r.ok = false;
        r.error = "manifest missing size";
    } else if (r.updateAvailable && r.signature.length() == 0) {
        r.ok = false;
        r.error = "manifest missing signature";
    } else if (r.updateAvailable && r.keyId.length() > 0 && r.keyId != kWalkerOtaSigningKeyId) {
        r.ok = false;
        r.error = "manifest signing key unsupported";
    }
    return r;
}

bool walkerOtaApply(const String& url, const String& expectedMd5,
                    const String& expectedSha256, size_t expectedSize,
                    const String& version, const String& signature,
                    const String& keyId,
                    void (*progressCb)(int pct), String& outErr) {
    if (!isHexDigest(expectedMd5, 32)) {
        outErr = "valid md5 required";
        return false;
    }
    if (!isHexDigest(expectedSha256, 64)) {
        outErr = "valid sha256 required";
        return false;
    }
    if (expectedSize == 0) {
        outErr = "valid size required";
        return false;
    }
    if (version.length() == 0) {
        outErr = "version required";
        return false;
    }
    if (signature.length() == 0) {
        outErr = "signature required";
        return false;
    }
    // Binary endpoint is mounted publicly on the server (LAN-only) — no
    // Authorization header needed. cfg lookup kept in case future flows
    // want to inject one again, but we no longer require any token.
    HTTPClient http;
    WiFiClient plainClient;
    WiFiClientSecure tlsClient;
    http.setTimeout(60000);
    if (!beginHttp(http, url, plainClient, tlsClient)) {
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
    if ((size_t) len != expectedSize) {
        outErr = "content-length size mismatch";
        http.end();
        return false;
    }

    mbedtls_md_context_t shaCtx;
    mbedtls_md_init(&shaCtx);
    bool shaReady = false;
    bool updateStarted = false;
    auto fail = [&](const String& msg) -> bool {
        outErr = msg;
        if (updateStarted) Update.abort();
        if (shaReady) {
            mbedtls_md_free(&shaCtx);
            shaReady = false;
        }
        http.end();
        return false;
    };

    const mbedtls_md_info_t* shaInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!shaInfo
        || mbedtls_md_setup(&shaCtx, shaInfo, 0) != 0
        || mbedtls_md_starts(&shaCtx) != 0) {
        return fail("sha256 init failed");
    }
    shaReady = true;

    if (!Update.begin(len)) {
        String err = Update.errorString();
        return fail(err);
    }
    updateStarted = true;
    if (expectedMd5.length() > 0) {
        Update.setMD5(expectedMd5.c_str());
    }

    WiFiClient* stream = http.getStreamPtr();
    uint8_t buf[1024];
    int written = 0;
    int lastPct = -1;
    uint32_t lastDataMs = millis();
    const uint32_t idleTimeoutMs = 15000;
    while (written < len) {
        if (!stream->available()) {
            if (!stream->connected()) {
                return fail("download disconnected");
            }
            if (millis() - lastDataMs > idleTimeoutMs) {
                return fail("download timeout");
            }
            delay(5);
            continue;
        }
        int want = len - written;
        if (want > (int) sizeof(buf)) want = sizeof(buf);
        int n = stream->readBytes(buf, want);
        if (n <= 0) {
            if (millis() - lastDataMs > idleTimeoutMs) {
                return fail("download timeout");
            }
            delay(5);
            continue;
        }
        lastDataMs = millis();
        if (mbedtls_md_update(&shaCtx, buf, (size_t) n) != 0) {
            return fail("sha256 update failed");
        }
        if (Update.write(buf, n) != (size_t) n) {
            String err = Update.errorString();
            return fail(err);
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

    if ((size_t) written != expectedSize) {
        return fail("written size mismatch");
    }

    uint8_t digest[32];
    if (mbedtls_md_finish(&shaCtx, digest) != 0) {
        return fail("sha256 finish failed");
    }
    mbedtls_md_free(&shaCtx);
    shaReady = false;

    String computedSha256 = bytesToHex(digest, sizeof(digest));
    if (!computedSha256.equalsIgnoreCase(expectedSha256)) {
        return fail("sha256 mismatch");
    }

    if (!verifyOtaSignature(version, expectedSize, expectedSha256, signature, keyId, outErr)) {
        return fail(outErr);
    }

    if (!Update.end(true)) {
        String err = Update.errorString();
        return fail(err);
    }
    updateStarted = false;
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
        if (!walkerOtaApply(r.url, r.md5, r.sha256, r.size,
                            r.latestVersion, r.signature, r.keyId,
                            nullptr, err)) {
            Serial.printf("[ota] apply failed: %s\n", err.c_str());
        }
    }
}
