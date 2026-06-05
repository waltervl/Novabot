# David (LFIN2231000633) — "kan niet maaien" diagnose

> **NB (2026-06-05): root cause achterhaald — zie het autoritatieve doc
> `docs/reference/COSTMAP-UNICOM-NAV.md`.** De costmap-analyse + verificatie-methode
> hieronder kloppen, maar de oorzaak is uiteindelijk **niet** "ToF overspoelt de
> costmap": het zijn de **ontbrekende inter-zone unicom-connectors** (regressie
> f6191a46) waardoor de smalle overlap-halzen tussen zones dichtknepen onder de
> inflatie. Fix in v2026.0605.0752.

**Datum:** 2026-06-04
**Symptoom:** maaier verlaat dock, rijdt paar meter heen/weer, keert terug naar charger. Geen maaisessie start.
**Conclusie (bijgewerkt):** NIET de kaart-geometrie, NIET de ToF-ruis — de **multi-zone kaart miste de inter-zone unicom-connectors**, dus de smalle halzen tussen zones knepen dicht onder costmap-inflatie → planner vindt geen pad.

## Bewijsketen (live op de maaier, 3-hop SSH)

1. **Frame is correct verankerd.** Docked map_position (0.009, -0.190) ≈ origin, heading 1.6908 rad (96.9°), frame_unvalidated=0, RTK Fixed, localization RUNNING. (Het eerder vermoede "97° re-anchor bug" is NIET de oorzaak — zie [reanchor-flow-authoritative].)

2. **Statische kaart is goed.** Flood-fill op `home0/map.pgm` (808x1002 @0.05, origin -37.90,-12.25) van start (0.22,-1.27) naar eerste maaipunt (-6.72,-2.67):
   - CONNECTED bij élke robot-clearance t/m **0.60m** erosie. De map.pgm geometrie blokkeert niets (robot inscribed radius = 0.22m).

3. **Coverage-plan slaagt.** `coverage_planner_server: Plan successfully with total area: 267.62`. Pad opgeslagen in `planned_path/current_planned_path.json`.

4. **nav2 global planner faalt.** `nav2_single_node_navigator: GridBased_AStar (ThetaStarPlanner) failed to generate a valid path to (-6.72,-2.67)` → `Not deal with path plan failed with current and goal not stucked` → coverage `NO_PATH_TO_GOAL` → `No valid path to goal`. TEB local planner oscilleert ("paar meter heen/weer").

5. **Costmap-architectuur:**
   - global_costmap plugins: `static_layer` + **`copy_layer`** (kopieert `/local_costmap/costmap`) + `inflation_layer`.
   - local_costmap plugins: `static_layer` + `prohibited_layer` + **`obstacle_layer` (pointcloud, ToF)** + **`range_sensor_layer` (/collision_range)** + `inflation_layer`.
   - Dus: live ToF/sensor-obstakels → local costmap → copy_layer → global costmap waarop de planner werkt.
   - `robot_radius` 0.22, inflation_radius 0.25–0.30.

6. **Live costmap snapshot (rclpy, maaier gedockt/idle):**
   - global 808x1002 (volle map). start (0.22,-1.27)=0 free, goal (-6.72,-2.67)=0 free.
   - **lethal-cellen live = 481.628 vs statisch occ = 446.709 → ~35.000 EXTRA lethal.**
   - local costmap (80x80 = 4×4m rond gedockte maaier) = **34% lethal** (2161/6400).
   - Flood-fill live global start→goal:
     - blocked bij cost ≥100 (alleen echt lethal): **CONNECTED**
     - blocked bij cost ≥99 (lethal + inscribed-inflatie): **DISCONNECTED**
   - → de corridor is door de live-laag **smaller dan de robot-inscribed-radius (0.22m)** geknepen. ThetaStar weigert door cost≥99 → geen pad.

7. **Waar zit de knijp:** diff live-vs-static in de corridor = **3497 cellen die statisch vrij zijn maar live cost≥99**, bbox x[-9.75,1.55] y[-5.30,1.65], dichtstbijzijnde op (0,0) = de dock zelf. Verspreid over het HELE gebied — geen enkel obstakel maar vlakdekkend.

8. `obstacle_avoidance_sensitivity = 0` (json_config.json) → géén over-gevoeligheid in config.

## Leidende hypothese
De ToF-camera markeert de **grond/het gras over het hele gebied** als obstakel (vlakdekkende flooding, incl. dock). Meest waarschijnlijk **te lang/ongemaaid gras** (deadlock: kan niet maaien → gras hoog → ToF ziet obstakels → kan niet maaien). Past bij "altijd kunnen maaien op LFI" (daar maaide hij regelmatig → kort gras). Alternatief: ToF grond-plane filtering (min obstacle height) regressie.

## Te bevestigen / fix-richtingen
- **Snel:** staat het gras hoog rond David's dock? (David laten kijken)
- **Technisch:** ToF perception ground-filter / `min_obstacle_height` config checken; live PCD opslaan (`perception_node: trigger to save pcd`) en punthoogtes bekijken; Alain's live costmap vergelijken (zou schoon moeten zijn).
- **Workaround-test (beweging, met toestemming + David):** maaier handmatig 2–3 m de open ruimte in joysticken, dán maaien starten → als de planner dan wél een pad vindt, bevestigt dat de near-dock choke.
- **Echte fix:** afhankelijk van bevestiging — gras knippen, ToF grond-filtering/obstacle min-height tunen, of costmap clearen bij task-start.

## Toegang
3-hop: `support@l-it.at:443` (jump) → `pi@rpi4-server` → `root@192.168.10.196` (mower). RPi dashboard-API op poort **80**. ROS env: galactic, ROS_LOCALHOST_ONLY=1 (repliceer env uit `/proc/<navpid>/environ` voor ros2 CLI). Expect-helpers: `/tmp/mower3.exp`, `/tmp/run_mower.exp`.
