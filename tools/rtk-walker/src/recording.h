// tools/rtk-walker/src/recording.h
//
// Recorder — state machine that bridges UI/CLI actions to SessionStore.
// Tracks the active recording mode (Work / Obstacle / Channel), filters
// inbound GPS fixes by RTK quality (fix>=4 and HDOP<=2 by default), and
// persists accepted points through the SessionStore.
//
// This class is a no-op when in Idle mode, so it is safe to call onFix()
// on every GPS update without paying any cost when no recording is in
// progress.
#pragma once
#include <Arduino.h>
#include "session.h"

enum class RecordingMode : uint8_t {
    Idle = 0,
    Work = 1,
    Obstacle = 2,
    Channel = 3,
};

enum class FixQuality : uint8_t {
    Bad = 0,        // fix < 4
    Float = 5,      // fix == 5
    Fix = 4,        // fix == 4
};

struct RecordingState {
    RecordingMode mode = RecordingMode::Idle;
    int parentSlot = -1;
    int slotInUse = -1;
    int obstacleIdx = -1;
    String channelTarget;
    unsigned long pointsCaptured = 0;
    unsigned long pointsDropped = 0;
    FixQuality lastFixQuality = FixQuality::Bad;
};

class Recorder {
public:
    Recorder(SessionStore& store) : sess_(store) {}

    bool startWork(int& outSlot);
    bool startObstacle(int parentSlot);
    bool startChannel(int parentSlot, const String& target);
    bool stop(bool discard);
    bool onFix(unsigned long ts, double lat, double lng, double alt,
               int fix, int sats, double hdop);

    const RecordingState& state() const { return state_; }
    bool isRecording() const { return state_.mode != RecordingMode::Idle; }

    static constexpr int kMinFix = 4;
    static constexpr double kMaxHdop = 2.0;
    static constexpr bool kAllowFloat = true;

private:
    SessionStore& sess_;
    RecordingState state_;
    bool ensureOrigin(double lat, double lng);
};
