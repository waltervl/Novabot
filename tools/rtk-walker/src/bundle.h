// tools/rtk-walker/src/bundle.h
//
// BundleBuilder — packages the current LittleFS /session/ directory into a
// STORED-mode .novabundle zip at /export/walker.novabundle. The zip layout
// is the contract the Novabot server uses (Task 8) to ingest a walker
// session as a mower-compatible portable bundle.
//
// Layout (entries inside the zip):
//   metadata.json    — schemaVersion, sourceType, walkerId, sessionId, ...
//   polygons.json    — [{ name: "map0", points: [{x,y}, ...] }, ...]
//   obstacles.json   — [{ name: "map0_0", points: [...] }, ...]
//   unicom.json      — [{ name: "map0tocharge", points: [...] }, ...]
//   walker/<csv>     — raw mirror of each CSV under /session/ for debugging
//
// STORED-mode (no deflate) is used because LittleFS doesn't ship with a
// deflate implementation by default and our bundles are < 1 MB anyway.
#pragma once

#include <Arduino.h>

#include "session.h"

class BundleBuilder {
public:
    explicit BundleBuilder(SessionStore& s) : sess_(s) {}

    // Build the bundle at /export/walker.novabundle. Returns the resulting
    // path on success, or an empty String on failure. Removes the old file
    // (and any leftover temp files) before writing.
    String build();

private:
    SessionStore& sess_;
};
