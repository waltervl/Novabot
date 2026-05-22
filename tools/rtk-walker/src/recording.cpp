// tools/rtk-walker/src/recording.cpp
//
// See recording.h for the high-level contract. This file implements the
// state transitions, RTK-quality gating, and the per-mode dispatch into
// SessionStore.
#include "recording.h"

#include <LittleFS.h>

namespace {

// Compose the base filename (without extension) that SessionStore uses
// for the file we're currently writing to. Mirrors the naming scheme in
// session.h so the discard path in stop() can locate the in-progress
// .csv / .raw files on LittleFS.
String currentBaseName(const RecordingState& s) {
    switch (s.mode) {
        case RecordingMode::Work:
            return String("map") + String(s.parentSlot) + "_work";
        case RecordingMode::Obstacle:
            return String("map") + String(s.parentSlot) + "_" +
                   String(s.obstacleIdx) + "_obstacle";
        case RecordingMode::Channel:
            return String("map") + String(s.parentSlot) + "to" +
                   s.channelTarget + "_unicom";
        case RecordingMode::Idle:
        default:
            return String();
    }
}

}  // namespace

bool Recorder::startWork(int& outSlot) {
    int slot = sess_.allocWorkSlot();
    if (slot < 0) return false;
    state_ = RecordingState{};
    state_.mode = RecordingMode::Work;
    state_.parentSlot = slot;
    state_.slotInUse = slot;
    outSlot = slot;
    return true;
}

bool Recorder::startObstacle(int parentSlot) {
    int idx = sess_.allocObstacleIndex(parentSlot);
    if (idx < 0) return false;
    state_ = RecordingState{};
    state_.mode = RecordingMode::Obstacle;
    state_.parentSlot = parentSlot;
    state_.slotInUse = parentSlot;
    state_.obstacleIdx = idx;
    return true;
}

bool Recorder::startChannel(int parentSlot, const String& target) {
    state_ = RecordingState{};
    state_.mode = RecordingMode::Channel;
    state_.parentSlot = parentSlot;
    state_.slotInUse = parentSlot;
    state_.channelTarget = target;
    return true;
}

bool Recorder::stop(bool discard) {
    if (discard && state_.mode != RecordingMode::Idle) {
        String base = currentBaseName(state_);
        if (base.length() > 0) {
            String csvPath = String("/session/") + base + ".csv";
            String rawPath = String("/session/") + base + ".raw";
            if (LittleFS.exists(csvPath)) LittleFS.remove(csvPath);
            if (LittleFS.exists(rawPath)) LittleFS.remove(rawPath);
        }
    }
    state_ = RecordingState{};
    return true;
}

bool Recorder::ensureOrigin(double lat, double lng) {
    double oLat = 0, oLng = 0;
    if (sess_.getOrigin(oLat, oLng)) return true;
    return sess_.setOrigin(lat, lng);
}

bool Recorder::onFix(unsigned long ts, double lat, double lng, double alt,
                     int fix, int sats, double hdop) {
    if (state_.mode == RecordingMode::Idle) return false;

    // Quality gate: drop anything below RTK FIX (fix < 4).
    if (fix < kMinFix) {
        state_.pointsDropped++;
        state_.lastFixQuality = FixQuality::Bad;
        return false;
    }
    // FLOAT is enum value 5 from the NMEA GGA fix-quality field. If we
    // ever flip kAllowFloat off, treat FLOAT as a drop too.
    if (fix == 5 && !kAllowFloat) {
        state_.pointsDropped++;
        state_.lastFixQuality = FixQuality::Float;
        return false;
    }
    if (hdop > kMaxHdop) {
        state_.pointsDropped++;
        // Keep lastFixQuality reflective of the fix value; the drop
        // reason is HDOP, not the fix quality itself.
        state_.lastFixQuality = (fix == 4) ? FixQuality::Fix : FixQuality::Float;
        return false;
    }

    state_.lastFixQuality = (fix == 4) ? FixQuality::Fix : FixQuality::Float;

    if (!ensureOrigin(lat, lng)) {
        state_.pointsDropped++;
        return false;
    }

    double x = 0, y = 0;
    if (!sess_.gpsToLocal(lat, lng, x, y)) {
        state_.pointsDropped++;
        return false;
    }

    String base = currentBaseName(state_);
    if (base.length() == 0) return false;

    bool ok = false;
    switch (state_.mode) {
        case RecordingMode::Work:
            ok = sess_.appendWorkPoint(state_.parentSlot, x, y);
            break;
        case RecordingMode::Obstacle:
            ok = sess_.appendObstaclePoint(state_.parentSlot, state_.obstacleIdx, x, y);
            break;
        case RecordingMode::Channel:
            ok = sess_.appendChannelPoint(state_.parentSlot, state_.channelTarget, x, y);
            break;
        case RecordingMode::Idle:
        default:
            return false;
    }

    if (!ok) {
        state_.pointsDropped++;
        return false;
    }

    sess_.appendRawRow(base, ts, lat, lng, alt, fix, sats, hdop);
    state_.pointsCaptured++;
    return true;
}
