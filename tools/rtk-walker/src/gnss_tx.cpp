#include "gnss_tx.h"

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

struct WalkerGnssTxItem {
  WalkerGnssTxKind kind;
  uint16_t len;
  uint8_t bytes[256];
};

// Queue depth in items (each up to 256 B). Bursty NTRIP must not enqueue
// more than the free slots or xQueueSend drops corrections — see
// walkerGnssTxFreeSlots() + the NTRIP backpressure loop in main.cpp.
#define WALKER_GNSS_TX_QUEUE_LEN 24

static HardwareSerial* g_serial = nullptr;
static QueueHandle_t g_queue = nullptr;
static WalkerGnssTxStats g_stats = {};
static WalkerGnssTxItem g_active = {};
static size_t g_activeOffset = 0;
static bool g_hasActive = false;

void walkerGnssTxSetup(HardwareSerial& serial) {
  g_serial = &serial;
  if (!g_queue) {
    g_queue = xQueueCreate(WALKER_GNSS_TX_QUEUE_LEN, sizeof(WalkerGnssTxItem));
  }
}

bool walkerGnssTxQueue(WalkerGnssTxKind kind, const uint8_t* bytes, size_t len) {
  if (!bytes || len == 0 || !g_queue) return false;

  size_t off = 0;
  bool ok = true;
  while (off < len) {
    WalkerGnssTxItem item = {};
    item.kind = kind;
    size_t n = len - off;
    if (n > sizeof(item.bytes)) n = sizeof(item.bytes);
    item.len = (uint16_t)n;
    memcpy(item.bytes, bytes + off, n);

    if (xQueueSend(g_queue, &item, 0) != pdTRUE) {
      g_stats.dropped++;
      ok = false;
      break;
    }

    g_stats.enqueued++;
    UBaseType_t depth = uxQueueMessagesWaiting(g_queue);
    uint16_t totalDepth = (uint16_t)depth + (g_hasActive ? 1 : 0);
    g_stats.queueDepth = totalDepth;
    if (totalDepth > g_stats.queueHighWater) g_stats.queueHighWater = totalDepth;
    off += n;
  }
  return ok;
}

bool walkerGnssTxQueueRtcmFromLora(const uint8_t* bytes, size_t len) {
  return walkerGnssTxQueue(WalkerGnssTxKind::RtcmFromLora, bytes, len);
}

bool walkerGnssTxQueueRtcmFromNtrip(const uint8_t* bytes, size_t len) {
  return walkerGnssTxQueue(WalkerGnssTxKind::RtcmFromNtrip, bytes, len);
}

bool walkerGnssTxQueuePairPayload(const String& payload) {
  uint8_t cs = 0;
  for (size_t i = 0; i < payload.length(); i++) cs ^= (uint8_t)payload[i];

  char out[200];
  int n = snprintf(out, sizeof(out), "$%s*%02X\r\n", payload.c_str(), cs);
  if (n <= 0 || n >= (int)sizeof(out)) return false;

  return walkerGnssTxQueue(WalkerGnssTxKind::PairCommand,
                           reinterpret_cast<const uint8_t*>(out),
                           (size_t)n);
}

void walkerGnssTxPump() {
  if (!g_serial || !g_queue) return;

  uint8_t budget = 8;
  while (budget-- > 0) {
    if (!g_hasActive) {
      if (xQueueReceive(g_queue, &g_active, 0) != pdTRUE) break;
      g_activeOffset = 0;
      g_hasActive = true;
    }

    int writable = g_serial->availableForWrite();
    if (writable <= 0) break;

    size_t remain = g_active.len - g_activeOffset;
    size_t n = remain;
    if (n > (size_t)writable) n = (size_t)writable;
    if (n > 64) n = 64;

    size_t wrote = g_serial->write(g_active.bytes + g_activeOffset, n);
    if (wrote == 0) break;

    g_activeOffset += wrote;
    g_stats.bytesWritten += wrote;
    if (g_activeOffset >= g_active.len) {
      g_hasActive = false;
      g_stats.written++;
    }
  }

  uint16_t totalDepth = (uint16_t)uxQueueMessagesWaiting(g_queue) + (g_hasActive ? 1 : 0);
  g_stats.queueDepth = totalDepth;
  if (totalDepth > g_stats.queueHighWater) g_stats.queueHighWater = totalDepth;
}

size_t walkerGnssTxFreeSlots() {
  if (!g_queue) return 0;
  UBaseType_t waiting = uxQueueMessagesWaiting(g_queue);
  if ((size_t) waiting >= (size_t) WALKER_GNSS_TX_QUEUE_LEN) return 0;
  return (size_t) WALKER_GNSS_TX_QUEUE_LEN - (size_t) waiting;
}

void walkerGnssTxGetStats(WalkerGnssTxStats& out) {
  out = g_stats;
  if (g_queue) {
    out.queueDepth = (uint16_t)uxQueueMessagesWaiting(g_queue) + (g_hasActive ? 1 : 0);
  }
}
