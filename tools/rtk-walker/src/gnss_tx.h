#pragma once

#include <Arduino.h>

enum class WalkerGnssTxKind : uint8_t {
  RtcmFromLora,
  RtcmFromNtrip,
  PairCommand,
};

struct WalkerGnssTxStats {
  uint32_t enqueued;
  uint32_t dropped;
  uint32_t written;
  uint32_t bytesWritten;
  uint16_t queueDepth;
  uint16_t queueHighWater;
};

void walkerGnssTxSetup(HardwareSerial& serial);
bool walkerGnssTxQueue(WalkerGnssTxKind kind, const uint8_t* bytes, size_t len);
bool walkerGnssTxQueueRtcmFromLora(const uint8_t* bytes, size_t len);
bool walkerGnssTxQueueRtcmFromNtrip(const uint8_t* bytes, size_t len);
bool walkerGnssTxQueuePairPayload(const String& payload);
void walkerGnssTxPump();
void walkerGnssTxGetStats(WalkerGnssTxStats& out);
