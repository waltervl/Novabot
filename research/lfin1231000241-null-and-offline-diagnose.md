# LFIN1231000241 — "null payload crasht server" + mower/charger offline

Remote-support diagnose 2026-06-10 (Docker-for-Windows gebruiker, server `192.168.86.187`,
mower `192.168.86.224`). Via `rs-exec.sh` in de user-container → `sshpass ssh root@mower`.

## Symptoom (zoals gemeld)
1. Mower stuurt "alleen null payload" → container crashte.
2. Daarna: mower én charger tonen offline in app/admin.

## Bevinding 1 — de null-storm (OPGELOST)
- Niet de maaier-telemetrie. Het was `extended_commands.py` (custom firmware script,
  clientId `publish_<SN>`/`ext_cmd_<SN>`) die in een loop connect→`null`→disconnect deed
  (**314×/run**) op een kaal topic `LFIN1231000241`.
- Root cause: extended_commands.py was bij boot (13:36) gestart **vóór** `mqtt.lfibot.com`
  naar de lokale server (.187) wees, resolvede toen naar de **publieke LFI-cloud
  `47.253.162.193:1883`** (Alibaba) en bleef daar hangen (CLOSE-WAIT). Geen data → het
  publiceerde `null` naar de lokale server in een reconnect-loop.
- Dat veroorzaakte de container crash-loop: **13 (re)starts tussen 16:15–16:23** (oudere
  build zonder null-guard). Huidige build (v2026.0609.2327) verdraagt de null wel.
- **Fix toegepast (live, runtime):** `extended_commands.py` + `mqtt_node` herstart met de
  exacte ROS-env uit `run_novabot.sh`. extended_commands verbindt nu correct met
  `192.168.86.187:1883`; cloud-conns = 0; null-storm gestopt.

## Bevinding 2 — mower/charger offline (NIET opgelost, dieper)
- `mqtt_node` draait maar verbindt nergens mee: hangt in **SYN-SENT naar `192.168.4.1:3333`**
  (ESP32-charger-AP gateway, ander subnet → onroutable → eeuwig SYN-SENT). Dit was al zo
  **vóór** de herstart — niet door mij veroorzaakt.
- `192.168.4.1:3333` = **factory-default fallback** van de firmware wanneer er geen geldig
  server-adres is. Staat niet in de configs → hardcoded default in de mqtt_node binary.
- Oorzaak-keten: `/userdata/lfi/http_address.txt` was **leeg (0 bytes)**.
  `set_server_urls.sh` vult dat via **mDNS SRV** (`opennova.local`/`opennovabot.local`).
  Maar op **Docker-for-Windows kan de container geen mDNS adverteren** (zelfde beperking
  als het oorspronkelijke probleem) → mDNS faalt → http_address bleef leeg → factory
  fallback `192.168.4.1:3333`.
- `set_server_urls.sh --restart-mqtt` opnieuw gedraaid → schreef `opennova.local:8080`,
  maar `opennova.local` resolvet hier niet → mqtt_node valt nog steeds terug op
  `192.168.4.1:3333`. **http_address.txt is NIET de bron van de 3333-fallback** (mqtt_node
  ging naar :3333, niet :8080).
- OPEN: waar mqtt_node host=192.168.4.1 + port=3333 vandaan haalt vs. wanneer het de
  MQTT-broker (json_config `mqtt.value.addr` = mqtt.lfibot.com:1883) zou moeten gebruiken.
  Vereist firmware-source/Ghidra of vergelijk met een werkende mower — NIET live gokken.

## Generaliseerbare bug (alle Docker-for-Windows / no-mDNS users)
`set_server_urls.sh` is **mDNS-only** voor het server-adres → op setups zonder werkende
mDNS-advertiser blijft `http_address.txt` leeg/onbruikbaar → mowers vallen terug op
factory `192.168.4.1:3333` → permanent offline. Fix hoort in `research/` +
`build_custom_firmware.sh`: DNS- of IP-fallback schrijven (bv. `mqtt.lfibot.com:<port>`
of raw server-IP) wanneer mDNS SRV faalt, i.p.v. een onresolvbare `opennova.local`.

## Update — http_address fix (poort 80, niet 8080) + restlaag
- **`FALLBACK_HTTP_PORT="8080"` in set_server_urls.sh is FOUT** (regel 29). 8080 is de
  ZimaOS/.247-productie-mapping; de OpenNova-default is **80** (OTA-URL bevestigde
  `http://192.168.86.187/` = poort 80). Fix in research/: fallback → 80.
- Handmatig gezet: `http_address.txt = mqtt.lfibot.com:80` (resolvbare host via DNS-rewrite
  → .187, correcte poort). **Effect:** mqtt_node hangt niet meer (alleen) op 3333 maar
  opent nu **TCP ESTAB naar `192.168.86.187:1883`** (de broker). Dus de lege/foute
  http_address dréef de 3333-fallback.
- **RESTLAAG (nog open):** ondanks de TCP-ESTAB naar .187:1883 logt de OpenNova-broker
  **geen MQTT CONNECT** en `device_registry.last_seen` update niet → mower nog niet online.
  mqtt_node houdt namelijk een TWEEDE, aparte verbinding naar **`192.168.4.1:3333`**
  (SYN-SENT, hangend) — die host komt NIET uit http_address (die is nu mqtt.lfibot.com) maar
  uit een andere/hardcoded bron in de mqtt_node-binary. Hypothese: mqtt_node voltooit de
  MQTT-sessie pas als de 3333-handshake lukt → de hangende 3333 blokkeert de telemetrie.
- **Volgende stap (niet live gokken):** waar mqtt_node `192.168.4.1:3333` vandaan haalt
  (firmware-source/Ghidra van mqtt_node), of vergelijk met een werkende mower die WEL online
  is — die heeft of geen 3333-hang, of een bereikbare 3333-endpoint. Pas dán gericht fixen.

## Cloud-block vraag (47.253.162.193:1883)
- Complementair, NIET de oorzaak van offline. Wel zinnig om te voorkomen dat clients ooit
  op de publieke cloud latchen (bevinding 1).
- Aanpak: iptables **REJECT** (niet DROP — fail-fast i.p.v. hang) naar de cloud op :1883,
  gebakken in de custom firmware (boot-hook in `set_server_urls.sh` / run_novabot.sh).
- Caveat: publieke cloud kan meerdere IP's hebben → beter de hele bekende range blokken of
  `mqtt.lfibot.com` hard naar de lokale server pinnen i.p.v. één IP.
