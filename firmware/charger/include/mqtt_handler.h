#pragma once
#include <Arduino.h>
#include "lora_commands.h"

// Initialize MQTT client (call after WiFi connected)
void mqttInit(const char* sn, const char* host, uint16_t port);

// Process MQTT client loop (non-blocking, call from mqtt_config_task)
void mqttLoop();

// Check connection state
bool mqttIsConnected();

// Connect to broker
void mqttConnect();

// Publish raw JSON (unencrypted) on charger's publish topic
bool mqttPublishRaw(const char* json);

// Publish AES-encrypted JSON on charger's publish topic
bool mqttPublishEncrypted(const char* json);

// Publish raw binary payload on an arbitrary topic (no encryption, no JSON wrap).
// Used for the RTCM byte stream so external RTK consumers (perimeter walker,
// NTRIP caster) can subscribe without dealing with JSON or AES.
bool mqttPublishBinary(const char* topic, const uint8_t* data, size_t len);

// Producer-side push: queue raw RTCM/NMEA bytes for MQTT publish from gps task.
// Drained in mqtt_config_task to keep PubSubClient single-threaded.
void mqttQueueRtcm(const uint8_t* data, size_t len);

// Build and publish up_status_info (matches Ghidra FUN_4200f00c)
void mqttPublishStatus();

// MQTT command dispatcher — handles 9 MQTT-only commands
// Called from mqtt_config_task when mqttCmdQueue receives 0x00
// Matches Ghidra FUN_4200e8c4
int mqttDispatchCommand();

// Get FreeRTOS queues
QueueHandle_t mqttGetLoraQueue();    // MQTT→LoRa relay commands
QueueHandle_t mqttGetOtaQueue();     // OTA trigger
QueueHandle_t mqttGetMqttCmdQueue(); // MQTT callback → mqtt_config_task

// mqtt_config_task — FreeRTOS task (matches Ghidra FUN_4200f158)
void mqttConfigTask(void* param);
