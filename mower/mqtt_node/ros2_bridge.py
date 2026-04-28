# mower/mqtt_node/ros2_bridge.py
"""ROS 2 bridge for the open mqtt_node.

This is a thin rclpy.Node that owns:
- All service clients the stock binary uses (~16, per mqtt_node-graph-snapshot.txt)
- All action clients the stock binary uses (2, per mqtt_node-graph-snapshot.txt)
- Topic subscriptions used by sensor_aggregator
- Topic publications used by the app/MQTT layer

The bridge does NOT contain MQTT logic — command_dispatcher routes
inbound payloads to bridge methods, and sensor_aggregator pulls cached
state out via getter methods.

Field-name discipline: every Request()/Goal() construction below MUST
have its fields verified by the AST test
mower/mqtt_node/tests/test_field_name_verification.py. That test
cross-checks against research/ros2_msg_definitions/ schemas. Do NOT
add a field that is not present in the cached schema.

Endpoint-name discipline: every endpoint string passed to
create_client/ActionClient MUST appear in
research/documents/mqtt_node-graph-snapshot.txt.  The test
test_no_fabricated_endpoint_names enforces this.  Endpoints that exist
only in robot_decision or decision_assistant (not in /mqtt_node's own
client list) are NOT wired here.
"""
from __future__ import annotations
import logging

import rclpy
from rclpy.node import Node
from rclpy.action import ActionClient
from rclpy.callback_groups import ReentrantCallbackGroup

# ROS 2 message imports — extend as new commands are wired
from std_srvs.srv import SetBool, Trigger, Empty
from decision_msgs.srv import (
    StartCoverageTask,
    StartMap,
    SaveMap,
    DeleteMap,
    GenerateCoveragePath,
    Charging as ChargingSrv,
)
from mapping_msgs.srv import SetChargingPose
from nav2_msgs.srv import ClearCostmapAroundRobot
from novabot_msgs.srv import Common
from platform_msgs.srv import OtaUpgradeSys
from novabot_msgs.action import ChassisLoraSet, ChassisPinCodeSet
from novabot_msgs.msg import CloudMoveCmd
from std_msgs.msg import UInt8 as UInt8Msg
from get_plan_interfaces.srv import PlanData

log = logging.getLogger('mqtt_node.ros2_bridge')


# Default joystick velocities used when the app sends `start_move <int>`
# without immediately following up with a continuous `mst` stream.
# Direction enum (per CLAUDE.md "Manual Control" + decompile capture):
#   1 = left, 2 = right, 3 = forward, 4 = backward
# linear_x in m/s, angular_wheel in rad/s. Values match observed app
# defaults (~0.3 m/s straight, ~1.0 rad/s spin) — once `mst` frames
# start flowing, those override these.
_START_MOVE_DEFAULTS = {
    1: (0.0, 1.0),     # left
    2: (0.0, -1.0),    # right
    3: (0.3, 0.0),     # forward
    4: (-0.3, 0.0),    # backward
}


class Ros2Bridge(Node):
    def __init__(self, shadow_mode: bool = False):
        # Shadow mode runs alongside the stock /mqtt_node binary —
        # different node name avoids DDS clash. Service calls are
        # logged-only (see call_service).
        node_name = 'open_mqtt_node_shadow' if shadow_mode else 'mqtt_node'
        super().__init__(node_name)
        self._shadow_mode = shadow_mode
        self._cb = ReentrantCallbackGroup()
        if shadow_mode:
            log.warning('ros2_bridge: SHADOW MODE — service/action calls '
                        'will be logged but not executed')

        # ── Service clients ────────────────────────────────────────────
        # Names come from research/documents/mqtt_node-graph-snapshot.txt
        # and are AST-verified by test_no_fabricated_endpoint_names.

        # Mowing / task control
        self.cli_start_cov_task = self.create_client(
            StartCoverageTask, '/robot_decision/start_cov_task',
            callback_group=self._cb)
        self.cli_stop_task = self.create_client(
            SetBool, '/robot_decision/stop_task',
            callback_group=self._cb)
        self.cli_cancel_task = self.create_client(
            Trigger, '/robot_decision/cancel_task',
            callback_group=self._cb)

        # Charging / recharge
        self.cli_auto_recharge = self.create_client(
            Trigger, '/robot_decision/auto_recharge',
            callback_group=self._cb)
        self.cli_cancel_recharge = self.create_client(
            Trigger, '/robot_decision/cancel_recharge',
            callback_group=self._cb)
        self.cli_nav_to_recharge = self.create_client(
            ChargingSrv, '/robot_decision/nav_to_recharge',
            callback_group=self._cb)

        # Mapping
        self.cli_start_mapping = self.create_client(
            StartMap, '/robot_decision/start_mapping',
            callback_group=self._cb)
        self.cli_start_assistant_mapping = self.create_client(
            SetBool, '/robot_decision/start_assistant_mapping',
            callback_group=self._cb)
        self.cli_add_area = self.create_client(
            StartMap, '/robot_decision/add_area',
            callback_group=self._cb)
        self.cli_reset_mapping = self.create_client(
            StartMap, '/robot_decision/reset_mapping',
            callback_group=self._cb)
        self.cli_save_map = self.create_client(
            SaveMap, '/robot_decision/save_map',
            callback_group=self._cb)
        self.cli_delete_map = self.create_client(
            DeleteMap, '/robot_decision/delete_map',
            callback_group=self._cb)
        self.cli_quit_mapping = self.create_client(
            Empty, '/robot_decision/quit_mapping_mode',
            callback_group=self._cb)
        self.cli_map_stop_record = self.create_client(
            SetBool, '/robot_decision/map_stop_record',
            callback_group=self._cb)
        self.cli_start_erase = self.create_client(
            SetBool, '/robot_decision/start_erase',
            callback_group=self._cb)

        # Preview path
        self.cli_generate_preview_path = self.create_client(
            GenerateCoveragePath,
            '/robot_decision/generate_preview_cover_path',
            callback_group=self._cb)

        # Charging pose
        self.cli_save_charging_pose = self.create_client(
            SetChargingPose, '/robot_decision/save_charging_pose',
            callback_group=self._cb)

        # Mid-task pause / resume (novabot_msgs/Common)
        self.cli_mid_pause = self.create_client(
            Common, '/MidPauseTask',
            callback_group=self._cb)
        self.cli_mid_resume = self.create_client(
            Common, '/MidResumeTask',
            callback_group=self._cb)
        self.cli_resume_task = self.create_client(
            Common, '/ResumeTask',
            callback_group=self._cb)

        # Costmap clear
        self.cli_clear_local_costmap = self.create_client(
            ClearCostmapAroundRobot,
            '/local_costmap/clear_around_local_costmap',
            callback_group=self._cb)

        # OTA service
        self.cli_ota_upgrade = self.create_client(
            OtaUpgradeSys, '/ota_upgrade_srv',
            callback_group=self._cb)

        # UTM origin reset
        self.cli_reset_utm = self.create_client(
            Empty, '/reset_utm_origin_info',
            callback_group=self._cb)

        # ── Topic publishers ──────────────────────────────────────────
        # All 7 application-level publishers from
        # research/documents/mqtt_node-graph-snapshot.txt Publishers
        # section. /rosout + /parameter_events are managed by rclpy.
        self.pub_cloud_move_cmd = self.create_publisher(
            CloudMoveCmd, '/cloud_move_cmd', 10)
        self.pub_mqtt_node_active = self.create_publisher(
            UInt8Msg, '/mqtt_node_active', 10)
        self.pub_init_mower = self.create_publisher(
            UInt8Msg, '/novabot/init_mower', 10)
        self.pub_release_charge_lock = self.create_publisher(
            UInt8Msg, '/release_charge_lock', 10)
        self.pub_timer_task_active = self.create_publisher(
            UInt8Msg, '/timer_task_active', 10)
        self.pub_unbind_finish = self.create_publisher(
            UInt8Msg, '/unbind_finish', 10)
        self.pub_wifi_ble_active = self.create_publisher(
            UInt8Msg, '/wifi_ble_active', 10)
        self.pub_x3_log_upload = self.create_publisher(
            UInt8Msg, '/x3/log/upload', 10)

        # ── Service server: /PlanCheckTask ──────────────────────────
        # Stock binary HOSTS this service — robot_decision queries it
        # to ask "is week N currently scheduled?" and gets back a plan
        # blob. The actual plan store lives on the cloud (cut_grass_plans
        # table) but mqtt_node serves a cached version via this RPC.
        # We answer with `value:0` (not scheduled) + empty plan until
        # a scheduling cache is wired (matches stock's pre-schedule
        # state for an idle mower).
        self.srv_plan_check_task = self.create_service(
            PlanData, '/PlanCheckTask', self._on_plan_check_task,
            callback_group=self._cb)

        # ── Action clients ─────────────────────────────────────────────
        # Only /chassis_lora_set and /chassis_pin_code_set appear under
        # /mqtt_node Action Clients in the live graph snapshot.
        # The navigation/boundary/auto-charging actions belong to
        # robot_decision — not wired here.
        self.act_chassis_lora_set = ActionClient(
            self, ChassisLoraSet, '/chassis_lora_set',
            callback_group=self._cb)
        self.act_chassis_pin_code_set = ActionClient(
            self, ChassisPinCodeSet, '/chassis_pin_code_set',
            callback_group=self._cb)

        log.info('ros2_bridge: node up with %d service clients + 2 action clients',
                 sum(1 for n in dir(self) if n.startswith('cli_')))

        # Aggregator wiring (set by bind_aggregator). The bridge subscribes
        # to /robot_decision/robot_status, /battery_message, /chassis_incident,
        # /bestpos_parsed_data, /gps_raw — those topics drive every field
        # in report_state_robot / report_state_timer_data /
        # report_exception_state.
        self._agg = None
        self._battery_state = 'UNKNOWN'

        # Cached signals for subscribers that don't currently surface
        # via outbound MQTT but the stock binary still subscribes to.
        self._pipe_charge_status: int = 0
        self._task_finish: int = 0
        self._timer_task_stop: int = 0
        self._mapping_close_map: bool = False
        self._mapping_save_csv: str = ''
        self._can_auto_follow_boundary: bool = False
        # Hooks set by main.py for cross-component wiring.
        self._ota_state_forwarder = None
        self._plan_lookup = None
        # scheduled_id from start_time_navigation, echoed in stop_time_*
        self._scheduled_id: str = ''

    def bind_aggregator(self, aggregator) -> None:
        """Wire ROS topic subscriptions that feed the SensorAggregator.

        Topics taken from research/documents/mqtt_node-graph-snapshot.txt
        (live SSH from /mqtt_node node info on LFIN1231000211).
        Schemas verified at research/ros2_msg_definitions/.
        """
        from decision_msgs.msg import RobotStatus, CovTaskResult
        from novabot_msgs.msg import (
            ChassisBatteryMessage, ChassisIncident, BestPos,
        )
        from sensor_msgs.msg import NavSatFix
        from std_msgs.msg import Bool, String, UInt8 as _UInt8
        from geometry_msgs.msg import Pose

        self._agg = aggregator

        self.create_subscription(
            RobotStatus, '/robot_decision/robot_status',
            self._on_robot_status, 10, callback_group=self._cb)
        self.create_subscription(
            ChassisBatteryMessage, '/battery_message',
            self._on_battery, 10, callback_group=self._cb)
        self.create_subscription(
            ChassisIncident, '/chassis_incident',
            self._on_incident, 10, callback_group=self._cb)
        self.create_subscription(
            BestPos, '/bestpos_parsed_data',
            self._on_bestpos, 10, callback_group=self._cb)
        self.create_subscription(
            NavSatFix, '/gps_raw',
            self._on_gps, 10, callback_group=self._cb)

        # cover_path subtree for report_state_timer_data
        self.create_subscription(
            String, '/robot_decision/covered_path_json',
            self._on_covered_path_json, 10, callback_group=self._cb)

        # planned_path JSON — mirrored as `plan_path` in timer_data
        self.create_subscription(
            String, '/robot_decision/planned_json',
            self._on_planned_json, 10, callback_group=self._cb)
        self.create_subscription(
            String, '/robot_decision/preview_planned_json',
            self._on_preview_planned_json, 10, callback_group=self._cb)

        # Map-position pose (stock binary uses this for `get_current_pose`)
        self.create_subscription(
            Pose, '/robot_decision/map_position',
            self._on_map_position, 10, callback_group=self._cb)

        # Coverage task result — report_state_robot finished_num+map_num
        # update at end-of-task even before the next robot_status frame.
        self.create_subscription(
            CovTaskResult, '/robot_decision/cov_task_result',
            self._on_cov_task_result, 10, callback_group=self._cb)

        # OTA installer service signals progress via this string topic.
        # mqtt_node forwards it as `ota_upgrade_state` per
        # ota-percentage-meaning.md memory.
        self.create_subscription(
            String, '/ota/upgrade_status',
            self._on_ota_upgrade_status, 10, callback_group=self._cb)

        # Charging dock pipe contact + reset_factory + task-end UInt8
        # signals. All feed lightweight aggregator state. close_map +
        # save_csv_file + can_auto_follow_boundary are mapping-side
        # context stock binary subscribes to but never reflects in
        # outbound MQTT — we still subscribe for parity.
        self.create_subscription(
            _UInt8, '/pipe_charge_status',
            self._on_pipe_charge_status, 10, callback_group=self._cb)
        self.create_subscription(
            _UInt8, '/reset_factory',
            self._on_reset_factory, 10, callback_group=self._cb)
        self.create_subscription(
            _UInt8, '/tast_finish',
            self._on_task_finish, 10, callback_group=self._cb)
        self.create_subscription(
            _UInt8, '/timer_task_stop',
            self._on_timer_task_stop, 10, callback_group=self._cb)
        self.create_subscription(
            Bool, '/novabot_mapping/close_map',
            self._on_mapping_close_map, 10, callback_group=self._cb)
        self.create_subscription(
            String, '/novabot_mapping/save_csv_file',
            self._on_mapping_save_csv, 10, callback_group=self._cb)
        self.create_subscription(
            Bool, '/nav2_single_node_navigator/can_auto_follow_boundary',
            self._on_can_auto_follow_boundary, 10, callback_group=self._cb)

        # Mapping flags emitted in report_state_timer_data (live graph
        # snapshot Subscribers section)
        self.create_subscription(
            Bool, '/novabot_mapping/if_closed_cycle',
            lambda m: self._agg.update_mapping_flags(
                if_closed_cycle=int(bool(m.data))) if self._agg else None,
            10, callback_group=self._cb)
        self.create_subscription(
            Bool, '/novabot_mapping/if_unicom_can_stop',
            lambda m: self._agg.update_mapping_flags(
                if_mower_can_finish=bool(m.data)) if self._agg else None,
            10, callback_group=self._cb)
        self.create_subscription(
            Bool, '/novabot_mapping/in_map_area',
            lambda m: self._agg.update_mapping_flags(
                if_scan_unicom_obstacle=int(bool(m.data))) if self._agg else None,
            10, callback_group=self._cb)
        self.create_subscription(
            Bool, '/novabot_mapping/start_build_unicom_area',
            lambda m: self._agg.update_mapping_flags(
                start_edit_or_assistant_map_flag=int(bool(m.data))) if self._agg else None,
            10, callback_group=self._cb)

        log.info('ros2_bridge: aggregator bound, 10 topic subscriptions live')

    # ── Aggregator callbacks ──────────────────────────────────────────

    def _on_robot_status(self, msg) -> None:
        """decision_msgs/msg/RobotStatus — primary feed for report_state_robot.
        Schema: research/ros2_msg_definitions/decision_msgs/msg/RobotStatus.msg
        Maps all 30 stock fields verified against the live container log
        capture from LFIN1231000211 2026-04-27.
        """
        if self._agg is None:
            return
        self._agg.update_status(
            task_mode=int(msg.task_mode),
            work_status=int(msg.work_status),
            recharge_status=int(msg.recharge_status),
            msg=str(msg.msg))
        self._agg.update_status_extras(
            prev_task_mode=int(msg.prev_task_mode),
            prev_work_status=int(msg.prev_work_status),
            prev_recharge_status=int(msg.prev_recharge_status),
            current_map_ids=int(msg.current_map_ids),
            request_map_ids=int(msg.request_map_ids),
            map_num=int(msg.map_num),
            finished_num=int(msg.finished_num),
            light=int(msg.light),
            perception_level=int(msg.perception_level))
        self._agg.update_error(
            error_status=int(msg.error_status),
            error_msg=str(msg.error_msg))
        self._agg.update_coverage(
            ratio=float(msg.cov_ratio),
            area=float(msg.cov_area),
            work_time=float(msg.cov_work_time),
            valid_work_time=float(msg.valid_cov_work_time),
            avoiding_obstacle_time=float(msg.avoiding_obstacle_time),
            estimate_time=float(msg.cov_estimate_time),
            remaining_area=float(msg.cov_remaining_area),
            map_path=str(msg.cov_map_path))
        self._agg.update_cpu(
            temp=int(msg.cpu_temperature),
            usage=int(msg.cpu_usage))
        self._agg.update_loc_quality(int(msg.loc_quality))
        self._agg.update_target_height(int(msg.target_height))
        self._agg.update_pose(
            x=float(msg.x), y=float(msg.y), theta=float(msg.theta))
        self._agg.update_battery(
            power_percent=int(msg.battery_power),
            state=self._battery_state)

    def _on_battery(self, msg) -> None:
        """novabot_msgs/msg/ChassisBatteryMessage — battery_state string.
        battery_current_ma > 0 → CHARGING; rsoc>=99 → FULL; else DISCHARGING.
        """
        if msg.battery_current_ma > 0:
            self._battery_state = 'CHARGING'
        elif msg.battery_rsoc_percent >= 99:
            self._battery_state = 'FULL'
        else:
            self._battery_state = 'DISCHARGING'
        if self._agg is not None:
            self._agg.update_battery(
                power_percent=int(msg.battery_rsoc_percent),
                state=self._battery_state)

    def _on_incident(self, msg) -> None:
        """novabot_msgs/msg/ChassisIncident — feeds both
        report_exception_state (app) and
        report_state_to_server_exception_respond (server).
        chassis_err = error_set_flag bitmask; rtk = healthy when not error_rtk.

        Schema fields verified against
        research/ros2_msg_definitions/novabot_msgs/msg/ChassisIncident.msg
        (live SSH 2026-04-26).
        """
        if self._agg is None:
            return
        wheel_stall = int(
            bool(msg.error_left_motor_stall_stop)
            + bool(msg.error_right_motor_stall_stop)
            + bool(msg.error_blade_motor_stall_stop)
        )
        self._agg.update_incident(
            # App-side (report_exception_state)
            button_stop=bool(msg.error_push_button_stop),
            chassis_err=int(msg.error_set_flag),
            no_set_pin_code=bool(msg.error_no_set_pin_code),
            rtk=not bool(msg.error_rtk),
            # Server-side (report_state_to_server_exception_respond robot_*)
            collision=bool(msg.error_collision_stop),
            overturn=bool(msg.error_turn_over),
            tilt=bool(msg.error_tile_stop),
            upraise=bool(msg.error_upraise_stop),
            wheel_stall=wheel_stall,
        )

    def _on_bestpos(self, msg) -> None:
        """novabot_msgs/msg/BestPos — RTK satellite count + GPS quality.
        sol_in_svs = sats used in solution; svs = total tracked.
        pos_type 48..56 = NARROW_INT range = RTK fix locked.
        wifi_rssi cached separately (system-level metric, not ROS).
        """
        if self._agg is None:
            return
        # Preserve any cached wifi_rssi already in the aggregator
        self._agg.update_signal(
            wifi_rssi=getattr(self._agg, '_wifi_rssi', 0),
            rtk_sat=int(msg.sol_in_svs),
        )
        # gps_status: 1 when we have any positional fix (pos_type > NONE).
        # gps_sat_num matches stock 'tracked sat' total = svs (33 in catalog).
        self._agg.update_gps_quality(
            sat_num=int(msg.svs),
            status=1 if int(msg.pos_type) > 0 else 0,
        )

    def _on_gps(self, msg) -> None:
        """sensor_msgs/msg/NavSatFix — gps_position for timer_data.
        status.status >= 0 → ENABLE (NavSatStatus.STATUS_FIX or better).
        """
        if self._agg is None:
            return
        state = 'ENABLE' if msg.status.status >= 0 else 'DISABLE'
        self._agg.update_gps(
            lat=float(msg.latitude),
            lng=float(msg.longitude),
            alt=float(msg.altitude),
            state=state)

    def _on_planned_json(self, msg) -> None:
        """std_msgs/msg/String — JSON-encoded `plan_path` subtree.
        Cached so timer_data report can surface a non-zero value once
        coverage planning finishes."""
        if self._agg is None:
            return
        try:
            data = __import__('json').loads(msg.data) if msg.data else 0
        except Exception:
            data = 0
        self._agg._plan_path = data

    def _on_preview_planned_json(self, msg) -> None:
        """std_msgs/msg/String — preview-coverage path. Cached for
        `report_state_timer_data.preview_cover_path` field."""
        if self._agg is None:
            return
        try:
            data = __import__('json').loads(msg.data) if msg.data else 0
        except Exception:
            data = 0
        self._agg._preview_cover_path = data

    def _on_map_position(self, msg) -> None:
        """geometry_msgs/msg/Pose — also feeds the pose cache (used by
        get_current_pose). Stock binary maintains a parallel cache here
        so /robot_decision/map_position can serve as a backup if
        robot_status hasn't ticked recently."""
        if self._agg is None:
            return
        # Pose is x/y plus quaternion. theta = yaw from quaternion.
        import math
        q = msg.orientation
        # Yaw extraction from quaternion (z/w around z-axis).
        siny_cosp = 2.0 * (q.w * q.z + q.x * q.y)
        cosy_cosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z)
        theta = math.atan2(siny_cosp, cosy_cosp)
        self._agg.update_pose(
            x=float(msg.position.x),
            y=float(msg.position.y),
            theta=float(theta))

    def _on_cov_task_result(self, msg) -> None:
        """decision_msgs/msg/CovTaskResult — task finished. Mirror the
        end-of-task counters into the aggregator so the next
        report_state_robot tick already shows finished_num/map_num
        without waiting on a robot_status follow-up."""
        if self._agg is None:
            return
        self._agg.update_status_extras(
            map_num=int(msg.map_num),
            finished_num=int(msg.finished_num),
        )
        log.info('cov_task_result: map_num=%d finished_num=%d work_status=%d '
                 'error_status=%d area=%.2f',
                 msg.map_num, msg.finished_num, msg.work_status,
                 msg.error_status, msg.area)

    def _on_ota_upgrade_status(self, msg) -> None:
        """std_msgs/msg/String — OTA installer phase signal.
        Per memory `ota-percentage-meaning.md`: 0..62 download (we own
        that), 62..68 unpack, 68..100 install (the installer side).
        Forward as `ota_upgrade_state` if a forwarder is wired."""
        if self._ota_state_forwarder is None:
            return
        try:
            self._ota_state_forwarder({'phase': str(msg.data)})
        except Exception:
            log.exception('ota_upgrade_status forward failed')

    # ─── Lightweight UInt8 subscribers (cached only) ────────────────

    def _on_pipe_charge_status(self, msg) -> None:
        """std_msgs/msg/UInt8 — charger pipe contact bitfield.
        Surfaced via cache; consumers can read pipe_charge_status."""
        self._pipe_charge_status = int(msg.data)

    def _on_reset_factory(self, msg) -> None:
        """std_msgs/msg/UInt8 — factory-reset trigger from the unbind
        flow. Stock binary clears its in-memory caches when this fires.
        We mirror by resetting the aggregator-side prev_* fields."""
        if int(msg.data) and self._agg is not None:
            log.info('reset_factory signal received — clearing prev_* state')
            self._agg.update_status_extras()

    def _on_task_finish(self, msg) -> None:
        self._task_finish = int(msg.data)

    def _on_timer_task_stop(self, msg) -> None:
        self._timer_task_stop = int(msg.data)

    def _on_mapping_close_map(self, msg) -> None:
        self._mapping_close_map = bool(msg.data)

    def _on_mapping_save_csv(self, msg) -> None:
        self._mapping_save_csv = str(msg.data)

    def _on_can_auto_follow_boundary(self, msg) -> None:
        self._can_auto_follow_boundary = bool(msg.data)

    # ─── PlanCheckTask service server ───────────────────────────────

    def _on_plan_check_task(self, request, response):
        """get_plan_interfaces/srv/PlanData — robot_decision asks
        "is there a plan for week X?" and we answer with `value:0`
        (no plan) + empty `plan` string. A future scheduler can
        override this method by setting `_plan_lookup` on the bridge.
        """
        week = str(request.week)
        lookup = getattr(self, '_plan_lookup', None)
        if callable(lookup):
            try:
                value, plan = lookup(week)
                response.value = int(value)
                response.plan = str(plan)
                return response
            except Exception:
                log.exception('PlanCheckTask lookup raised')
        # Default: no scheduled plan.
        response.value = 0
        response.plan = ''
        return response

    # ─── Publisher helpers ──────────────────────────────────────────

    def _publish_uint8(self, publisher, value: int) -> None:
        if self._shadow_mode:
            log.info('SHADOW: would publish UInt8(%d) on %s',
                     int(value), publisher.topic_name)
            return
        msg = UInt8Msg()
        msg.data = int(value) & 0xFF
        publisher.publish(msg)

    def announce_active(self, value: int = 1) -> None:
        """Publish /mqtt_node_active. Stock binary toggles this at boot
        (1 = ready) and on shutdown (0)."""
        self._publish_uint8(self.pub_mqtt_node_active, value)

    def init_mower(self) -> None:
        """Publish /novabot/init_mower(1) — boot signal the chassis
        node listens for to clear startup state."""
        self._publish_uint8(self.pub_init_mower, 1)

    def release_charge_lock(self, value: int = 1) -> None:
        """Publish /release_charge_lock(1) — releases the dock magnet.
        Used by edge-cut depart_pile flow per CLAUDE.md `extended_commands`."""
        self._publish_uint8(self.pub_release_charge_lock, value)

    def announce_timer_task(self, value: int) -> None:
        self._publish_uint8(self.pub_timer_task_active, value)

    def announce_unbind(self, value: int = 1) -> None:
        self._publish_uint8(self.pub_unbind_finish, value)

    def announce_wifi_ble(self, value: int) -> None:
        self._publish_uint8(self.pub_wifi_ble_active, value)

    def request_log_upload(self, value: int = 1) -> None:
        self._publish_uint8(self.pub_x3_log_upload, value)

    def _on_covered_path_json(self, msg) -> None:
        """std_msgs/msg/String — JSON-encoded cover_path subtree for
        report_state_timer_data. Stock format
        (catalog mqtt_node-payload-catalog.md report_state_timer_data
        cover_path):
            {"covered": {"covering_area": {...}, "finished_area": "",
                         "missed": "..."},
             "finished_maps": "1", "map_id": "1"}
        Bad JSON is logged and dropped — keeps last good cached subtree.
        """
        if self._agg is None:
            return
        import json
        try:
            data = json.loads(msg.data)
        except Exception as e:
            log.warning('covered_path_json: bad JSON (%s): %s',
                        e, msg.data[:120])
            return
        self._agg.update_cover_path(data)

    # ── Command handlers ──────────────────────────────────────────────

    def handle_start_navigation(self, mqtt_payload: dict) -> dict:
        """Handle MQTT ``start_navigation`` (also triggered by ``start_run``).

        MQTT JSON shape (catalog RE-5 §start_run / start_navigation):
          { "start_navigation": { "cmd_num": <int>, "area": <int>, "cutterhigh": <uint8> } }

        ROS 2 endpoint: /robot_decision/start_cov_task  (StartCoverageTask)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/StartCoverageTask.srv

        Field mapping (catalog RE-5 §start_run, decompile mqtt_node_decompiled.c:347738-347744):
          area       → request.map_ids       (uint32)
          cutterhigh → request.blade_heights (uint8[], index 0; formula: cutterhigh = user_cm − 2)
          (hardcoded) request.request_type   = 11 (0xb = MQTT normal start)
          (hardcoded) request.cov_mode       = 0  (NORMAL)
        """
        inner = mqtt_payload if not isinstance(mqtt_payload.get('start_navigation'), dict) \
            else mqtt_payload['start_navigation']

        req = StartCoverageTask.Request()
        req.cov_mode = 0  # StartCoverageTask.NORMAL
        req.request_type = 11  # 0xb — MQTT normal start (decompile:347738)

        area = inner.get('area')
        if area is not None:
            try:
                req.map_ids = int(area)
            except (TypeError, ValueError):
                log.warning('handle_start_navigation: invalid area=%r, using 0', area)
                req.map_ids = 0
        else:
            req.map_ids = 0

        cutterhigh = inner.get('cutterhigh')
        if cutterhigh is not None:
            try:
                req.blade_heights = [int(cutterhigh)]
            except (TypeError, ValueError):
                log.warning('handle_start_navigation: invalid cutterhigh=%r, skipping', cutterhigh)
                req.blade_heights = []
        else:
            req.blade_heights = []

        resp = self.call_service(self.cli_start_cov_task, req)
        if resp is None:
            return {'result': 1, 'msg': 'start_cov_task timeout or unavailable'}
        return {'result': 0 if resp.result else 1,
                'msg': 'start_navigation_respond'}

    # Alias: the MQTT docs call this start_run; the binary key is start_navigation.
    handle_start_run = handle_start_navigation

    def handle_stop_task(self, mqtt_payload: dict) -> dict:
        """Handle MQTT ``stop_task`` (also ``stop_run`` / ``stop_navigation``).

        MQTT JSON shape (catalog RE-5 §stop_run / stop_task):
          { "stop_task": <any> }

        ROS 2 endpoint: /robot_decision/stop_task  (std_srvs/srv/SetBool)
        Schema: research/ros2_msg_definitions/std_srvs/srv/SetBool.srv

        Field mapping:
          data = True  (stop the current task)
        """
        req = SetBool.Request()
        req.data = True  # True = stop (catalog: "likely true = stop")

        resp = self.call_service(self.cli_stop_task, req)
        if resp is None:
            return {'result': 1, 'msg': 'stop_task timeout or unavailable'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'stop_task_respond'}

    def handle_stop_to_charge(self, mqtt_payload: dict) -> dict:
        """Handle MQTT ``stop_to_charge``.

        MQTT JSON shape (catalog RE-5 §stop_to_charge, decompile:349576):
          { "stop_to_charge": <any> }

        ROS 2 endpoint: /robot_decision/cancel_recharge  (std_srvs/srv/Trigger)
        Schema: research/ros2_msg_definitions/std_srvs/srv/Trigger.srv

        Trigger.Request has no fields — just call the service.
        """
        req = Trigger.Request()
        # No request fields on Trigger (schema: empty request section)

        resp = self.call_service(self.cli_cancel_recharge, req)
        if resp is None:
            return {'result': 1, 'msg': 'cancel_recharge timeout or unavailable'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'stop_to_charge_respond'}

    def handle_auto_recharge(self, payload: dict) -> dict:
        """Handle MQTT ``auto_recharge``.

        MQTT JSON shape (catalog RE-5 §auto_recharge, decompile:349064):
          { "auto_recharge": <any> }

        ROS 2 endpoint: /robot_decision/auto_recharge  (std_srvs/srv/Trigger)
        Schema: research/ros2_msg_definitions/std_srvs/srv/Trigger.srv

        Trigger.Request has no fields — just call the service.
        Response fields: success (bool), message (string).
        """
        req = Trigger.Request()
        # No request fields on Trigger (schema: empty request section)

        resp = self.call_service(self.cli_auto_recharge, req)
        if resp is None:
            return {'result': 1, 'msg': 'auto_recharge timeout or unavailable'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'auto_recharge_respond'}

    def handle_nav_to_recharge(self, payload: dict) -> dict:
        """Handle MQTT ``go_to_charge`` (mapped as nav_to_recharge).

        MQTT JSON shape (catalog RE-5 §go_to_charge, decompile:350102):
          { "go_to_charge": <any> }

        ROS 2 endpoint: /robot_decision/nav_to_recharge  (decision_msgs/srv/Charging)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/Charging.srv

        Catalog notes (RE-5 §go_to_charge, line 135):
          "The ROS2 request fields (name, pose_x, pose_y, pose_theta, mode)
           are populated from internal state — exact mapping <unknown — needs
           Ghidra deep-dive> beyond the MQTT key name."

        We populate what we can from the payload (if present); otherwise the
        firmware fills fields from its own internal state on the ROS2 side.
        Fields per schema: name (string), pose_x (float32), pose_y (float32),
        pose_theta (float32), mode (string).
        Response fields: result (uint8), description (string).
        """
        inner = payload if not isinstance(payload.get('go_to_charge'), dict) \
            else payload['go_to_charge']

        req = ChargingSrv.Request()
        # Populate from payload if present; defaults match empty/zero state.
        req.name = str(inner.get('name', ''))           # string
        req.pose_x = float(inner.get('pose_x', 0.0))   # float32
        req.pose_y = float(inner.get('pose_y', 0.0))   # float32
        req.pose_theta = float(inner.get('pose_theta', 0.0))  # float32
        req.mode = str(inner.get('mode', ''))           # string

        resp = self.call_service(self.cli_nav_to_recharge, req)
        if resp is None:
            return {'result': 1, 'msg': 'nav_to_recharge timeout or unavailable'}
        return {'result': 0 if resp.result == 0 else 1,
                'msg': resp.description or 'go_to_charge_respond'}

    # Alias: MQTT docs call this go_to_charge; ROS2 endpoint is nav_to_recharge.
    handle_go_to_charge = handle_nav_to_recharge
    # `go_pile` is the older app spelling (catalog RE-5 §go_pile,
    # decompile:350157). Same handler — just pass through.
    handle_go_pile = handle_nav_to_recharge

    # `stop_run` is the older app spelling for stop_task (catalog RE-5 line 25
    # "start_run / start_navigation" + line 64 "stop_run / stop_task"). Same
    # handler — only the MQTT key differs.
    handle_stop_run = handle_stop_task

    def handle_start_time_navigation(self, payload) -> dict:
        """Handle MQTT ``start_time_navigation`` — scheduled mowing start.

        MQTT JSON shape (decompile mqtt_node:346911 +
        catalog RE-5 §start_time_navigation):
          { "start_time_navigation": { "id": "<scheduled_id>",
                                       "repeat": <int>,
                                       "work_time": <int>,
                                       "area": <int>,
                                       "cutterhigh": <int>,
                                       "cmd_num": <int> } }

        ROS 2 endpoint: /robot_decision/start_cov_task
                        (decision_msgs/srv/StartCoverageTask)

        Per Ghidra (line 346962): same StartCoverageTask request the
        regular `start_navigation` builds, plus the scheduled `id`
        cached in a global. We mirror that with one
        request_type difference — value 12 (scheduled) instead of 11
        (live MQTT command). Stock binary toggles the same field at
        line 346999 area; the precise enum value isn't visible in the
        decompile so we use 11 for parity until live capture confirms
        a different value.

        Response: `{result, msg, id}` — id echoes the scheduled task
        identifier so the app can confirm acceptance.
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('start_time_navigation', payload)
            if isinstance(payload.get('start_time_navigation'), dict)
            else payload)
        scheduled_id = ''
        if isinstance(inner, dict):
            sid = inner.get('id')
            if isinstance(sid, str):
                scheduled_id = sid
        # Cache the most-recently-scheduled id so stop_time_navigation
        # can echo the same value back for app-side correlation.
        self._scheduled_id = scheduled_id

        req = StartCoverageTask.Request()
        req.cov_mode = 0           # NORMAL
        req.request_type = 11      # 0xb — same as live MQTT start; the
                                   # binary doesn't differentiate at
                                   # this layer (the timer queue does)
        try:
            req.map_ids = int(inner.get('area', 0)) if isinstance(inner, dict) else 0
        except (TypeError, ValueError):
            req.map_ids = 0
        try:
            cutter = inner.get('cutterhigh') if isinstance(inner, dict) else None
            req.blade_heights = [int(cutter)] if cutter is not None else []
        except (TypeError, ValueError):
            req.blade_heights = []

        resp = self.call_service(self.cli_start_cov_task, req)
        if resp is None:
            return {'result': 1, 'msg': 'start_cov_task timeout',
                    'id': scheduled_id}
        return {'result': 0 if resp.result else 1,
                'msg': 'start_time_navigation_respond',
                'id': scheduled_id}

    def handle_stop_time_navigation(self, payload) -> dict:
        """Handle MQTT ``stop_time_navigation`` — cancel the scheduled task.

        Per Ghidra (mqtt_node:325477) the stock binary calls
        `send_msg_to_task_timer_queue(2, 0)` — an INTERNAL C++ queue
        message, NOT a ROS service. The actual scheduling lives in
        another component (the timer worker thread inside the same
        process). Without that runtime we fall back to a clean ack
        with a passthrough of the most recently scheduled id.

        Response shape mirrors the decompile (line 325568-325596):
          { type: "stop_time_navigation_respond",
            message: { result: 0, value: 0 } }
        We emit the simpler `{result, id}` form our dispatcher already
        wraps so the wire shape stays consistent with the rest.
        """
        scheduled_id = getattr(self, '_scheduled_id', '') or ''
        if isinstance(payload, dict):
            sid = payload.get('id')
            if isinstance(sid, str):
                scheduled_id = sid
        log.info('stop_time_navigation: id=%r (queue-only stub)', scheduled_id)
        return {'result': 0, 'id': scheduled_id}

    def handle_pause_run(self, payload) -> dict:
        """Handle MQTT ``pause_run`` — pause the active mowing task.

        MQTT JSON shape (catalog RE-5 §pause_run, decompile:347820):
          { "pause_run": <any> }

        ROS 2 endpoint: /MidPauseTask  (novabot_msgs/srv/Common)
        Schema: research/ros2_msg_definitions/novabot_msgs/srv/Common.srv

        Common.Request has one field:
          string data
        We pass an empty string — the stock binary's call site puts no
        meaningful payload here per decompile:347820. The decision node
        on the other side reads only the call event, not the data.
        """
        req = Common.Request()
        req.data = ''
        resp = self.call_service(self.cli_mid_pause, req)
        if resp is None:
            return {'result': 1, 'msg': 'mid_pause timeout or unavailable'}
        # Common.Response: uint8 result. result == 0 = success per decision_msgs convention.
        return {'result': 0 if int(resp.result) == 0 else 1,
                'msg': 'pause_run_respond'}

    def handle_resume_run(self, payload) -> dict:
        """Handle MQTT ``resume_run`` — resume a paused mowing task.

        MQTT JSON shape (catalog RE-5 §resume_run, decompile:347901):
          { "resume_run": <any> }

        Stock binary calls TWO services in sequence — `/ResumeTask` first,
        then `/MidResumeTask` if ResumeTask succeeds. Decompile shows
        both clients wired, with ResumeTask as the primary path
        (catalog RE-5 §resume_run line 105-118, "Two clients; try
        ResumeTask first").

        Both endpoints are novabot_msgs/srv/Common (string data,
        uint8 result).
        """
        req = Common.Request()
        req.data = ''

        primary = self.call_service(self.cli_resume_task, req)
        if primary is not None and int(primary.result) == 0:
            # ResumeTask accepted; the second call is the mid-task
            # confirmation. Failure on MidResumeTask isn't fatal —
            # the task already resumed.
            mid = self.call_service(self.cli_mid_resume, req)
            if mid is None:
                log.warning('resume_run: MidResumeTask unavailable, ResumeTask succeeded')
            return {'result': 0, 'msg': 'resume_run_respond'}

        if primary is None:
            return {'result': 1, 'msg': 'resume_task timeout or unavailable'}
        return {'result': 1, 'msg': 'resume_run_respond'}

    def handle_cancel_task(self, payload: dict) -> dict:
        """Handle MQTT ``cancel_task``.

        MQTT JSON shape: { "cancel_task": <any> }
        (The string "/robot_decision/cancel_task" appears in
        mqtt_node-strings.md:688 and graph-snapshot.txt:56, confirming the
        client is wired in mqtt_node. No separate catalog entry exists as of
        Phase 2 — the MQTT key is inferred from the endpoint name.)

        ROS 2 endpoint: /robot_decision/cancel_task  (std_srvs/srv/Trigger)
        Schema: research/ros2_msg_definitions/std_srvs/srv/Trigger.srv

        Trigger.Request has no fields — just call the service.
        Response fields: success (bool), message (string).
        """
        req = Trigger.Request()
        # No request fields on Trigger (schema: empty request section)

        resp = self.call_service(self.cli_cancel_task, req)
        if resp is None:
            return {'result': 1, 'msg': 'cancel_task timeout or unavailable'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'cancel_task_respond'}

    def handle_cancel_recharge(self, payload: dict) -> dict:
        """Handle MQTT ``cancel_recharge``.

        This is a direct-name alias for ``stop_to_charge``.  The underlying
        ROS 2 endpoint is /robot_decision/cancel_recharge (Trigger).
        ``handle_stop_to_charge`` is the canonical implementation;
        ``handle_cancel_recharge`` delegates to it so both MQTT key spellings
        are handled by the same logic.

        MQTT JSON shape: { "cancel_recharge": <any> }

        ROS 2 endpoint: /robot_decision/cancel_recharge  (std_srvs/srv/Trigger)
        Schema: research/ros2_msg_definitions/std_srvs/srv/Trigger.srv
        Response fields: success (bool), message (string).
        """
        return self.handle_stop_to_charge(payload)

    # NOTE: handle_reset_data is intentionally NOT implemented.
    # /robot_decision/reset_data (std_srvs/SetBool) is a SERVICE SERVER on
    # robot_decision, not a service client of mqtt_node.  It does NOT appear
    # in research/documents/mqtt_node-graph-snapshot.txt under /mqtt_node's
    # Service Clients section.  cli_reset_data therefore does not exist on
    # this bridge and cannot be called here.  If a direct MQTT→reset_data
    # path is needed in future, a cli_reset_data client must first be added
    # to __init__ (after confirming the endpoint appears in the live graph).

    # ── Mapping handlers ─────────────────────────────────────────────────

    def handle_start_scan_map(self, payload: dict) -> dict:
        """Handle MQTT ``start_scan_map`` — begin a new mapping session.

        MQTT JSON shape (catalog RE-5 §start_scan_map, decompile:341434):
          { "start_scan_map": { "cmd_num": <int>, "model": "<string>",
                                "mapName": "<string>", "type": <int> } }

        ROS 2 endpoint: /robot_decision/start_mapping  (decision_msgs/srv/StartMap)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/StartMap.srv

        Field mapping (request):
          model   → request.model   (string — mapping model name)
          mapName → request.mapname (string — map file name)
          type    → request.type    (uint8; 0 = work map, 1 = obstacle map)
          cmd_num → (dedup guard, NOT forwarded to ROS2)

        Field mapping (response):
          result  → uint8 (0 = success)
          data    → informational string
        """
        inner = payload if not isinstance(payload.get('start_scan_map'), dict) \
            else payload['start_scan_map']

        req = StartMap.Request()
        req.model = str(inner.get('model', ''))       # string
        req.mapname = str(inner.get('mapName', ''))   # string
        try:
            req.type = int(inner.get('type', 0))      # uint8
        except (TypeError, ValueError):
            log.warning('handle_start_scan_map: invalid type=%r, using 0',
                        inner.get('type'))
            req.type = 0

        resp = self.call_service(self.cli_start_mapping, req)
        if resp is None:
            return {'result': 1, 'msg': 'start_mapping timeout or unavailable'}
        return {'result': 0 if resp.result == 0 else 1,
                'msg': resp.data or 'start_scan_map_respond'}

    def handle_add_scan_map(self, payload: dict) -> dict:
        """Handle MQTT ``add_scan_map`` — add an area to an ongoing mapping session.

        MQTT JSON shape (catalog RE-5 §add_scan_map, decompile:340269):
          { "add_scan_map": { "cmd_num": <int>, "mapName": "<string>",
                              "type": <int> } }

        ROS 2 endpoint: /robot_decision/add_area  (decision_msgs/srv/StartMap)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/StartMap.srv

        Field mapping (request):
          mapName → request.mapname (string)
          type    → request.type    (uint8; 0 = unicom/work boundary, 1 = obstacle)
                    Note: obstacle live-capture uses type:1; unicom uses type:0.
                    See research/documents/novabot-ble-mapping-protocol.md.
          model   → request.model   (string; not present in add_scan_map MQTT
                                     payload, left as empty string default)
          cmd_num → (dedup guard, NOT forwarded to ROS2)

        Field mapping (response):
          result  → uint8 (0 = success)
          data    → informational string
        """
        inner = payload if not isinstance(payload.get('add_scan_map'), dict) \
            else payload['add_scan_map']

        req = StartMap.Request()
        req.mapname = str(inner.get('mapName', ''))   # string
        req.model = str(inner.get('model', ''))       # string (not in MQTT payload; default '')
        try:
            req.type = int(inner.get('type', 0))      # uint8
        except (TypeError, ValueError):
            log.warning('handle_add_scan_map: invalid type=%r, using 0',
                        inner.get('type'))
            req.type = 0

        resp = self.call_service(self.cli_add_area, req)
        if resp is None:
            return {'result': 1, 'msg': 'add_area timeout or unavailable'}
        return {'result': 0 if resp.result == 0 else 1,
                'msg': resp.data or 'add_scan_map_respond'}

    def handle_save_map(self, payload: dict) -> dict:
        """Handle MQTT ``save_map`` — finalise a sub-map or total map.

        Sent TWICE per mapping session:
          type:0 — sub map (writes csv_file + x3_csv_file)
          type:1 — total map (generates map.pgm / map.png / map.yaml)
        See CLAUDE.md "BLE Mapping — save_map type:0 vs type:1" for
        the exact timing (500ms Flutter delay between them).

        MQTT JSON shape (catalog RE-5 §save_map, decompile:339763):
          { "save_map": { "cmd_num": <int>, "mapName": "<string>",
                          "type": <int> } }

        ROS 2 endpoint: /robot_decision/save_map  (decision_msgs/srv/SaveMap)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/SaveMap.srv

        Field mapping (request):
          mapName    → request.mapname    (string)
          type       → request.type       (int64; 0 = sub, 1 = total)
          resolution → request.resolution (float32; not in MQTT payload,
                                           ROS2 default used — decompile §save_map
                                           does not extract resolution from JSON)
          cmd_num    → (dedup guard, NOT forwarded to ROS2)

        Field mapping (response):
          result     → uint8 (0 = success)
          error_code → uint8 (1=overlap other map, 2=overlap unicom, 3=cross multi maps)
          data       → informational string
        """
        inner = payload if not isinstance(payload.get('save_map'), dict) \
            else payload['save_map']

        req = SaveMap.Request()
        req.mapname = str(inner.get('mapName', ''))   # string
        try:
            req.type = int(inner.get('type', 0))      # int64
        except (TypeError, ValueError):
            log.warning('handle_save_map: invalid type=%r, using 0',
                        inner.get('type'))
            req.type = 0
        # resolution: not present in MQTT payload; use ROS2 default (0.0)
        req.resolution = 0.0                          # float32

        resp = self.call_service(self.cli_save_map, req)
        if resp is None:
            return {'result': 1, 'msg': 'save_map timeout or unavailable'}
        return {'result': 0 if resp.result == 0 else 1,
                'msg': resp.data or 'save_map_respond',
                'error_code': int(resp.error_code)}

    def handle_delete_map(self, payload: dict) -> dict:
        """Handle MQTT ``delete_map`` — delete a named map.

        MQTT JSON shape (catalog RE-5 §delete_map, decompile:345258):
          { "delete_map": { "mapName": "<string>", "maptype": <uint8> } }

        ROS 2 endpoint: /robot_decision/delete_map  (decision_msgs/srv/DeleteMap)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/DeleteMap.srv

        Field mapping (request):
          mapName  → request.mapname  (string)
          maptype  → request.maptype  (uint8; exact enum values unknown — Ghidra
                                       deep-dive needed; forwarded verbatim)

        Field mapping (response):
          result      → uint8 (0 = success)
          description → string
        """
        inner = payload if not isinstance(payload.get('delete_map'), dict) \
            else payload['delete_map']

        req = DeleteMap.Request()
        req.mapname = str(inner.get('mapName', ''))   # string
        try:
            req.maptype = int(inner.get('maptype', 0))  # uint8
        except (TypeError, ValueError):
            log.warning('handle_delete_map: invalid maptype=%r, using 0',
                        inner.get('maptype'))
            req.maptype = 0

        resp = self.call_service(self.cli_delete_map, req)
        if resp is None:
            return {'result': 1, 'msg': 'delete_map timeout or unavailable'}
        return {'result': 0 if resp.result == 0 else 1,
                'msg': resp.description or 'delete_map_respond'}

    def handle_quit_mapping_mode(self, payload: dict) -> dict:
        """Handle MQTT ``quit_mapping_mode`` — exit mapping mode.

        MQTT JSON shape (catalog RE-5 §quit_mapping_mode, decompile:338506):
          { "quit_mapping_mode": <any> }

        ROS 2 endpoint: /robot_decision/quit_mapping_mode  (std_srvs/srv/Empty)
        Schema: research/ros2_msg_definitions/std_srvs/srv/Empty.srv

        Empty.Request has no fields — just call the service.
        Empty.Response has no fields either; success is inferred from the call
        completing without timeout.
        """
        req = Empty.Request()
        # No request or response fields on Empty (schema: only --- separator)

        resp = self.call_service(self.cli_quit_mapping, req)
        if resp is None:
            return {'result': 1, 'msg': 'quit_mapping_mode timeout or unavailable'}
        # Empty response has no success flag — treat any non-None response as success
        return {'result': 0, 'msg': 'quit_mapping_mode_respond'}

    def handle_start_assistant_build_map(self, payload: dict) -> dict:
        """Handle MQTT ``start_assistant_build_map`` — start autonomous mapping.

        MQTT JSON shape (catalog RE-5 §start_assistant_build_map, decompile:342434):
          { "start_assistant_build_map": { "cmd_num": <int>, "value": <bool> } }

        ROS 2 endpoint: /robot_decision/start_assistant_mapping  (std_srvs/srv/SetBool)
        Schema: research/ros2_msg_definitions/std_srvs/srv/SetBool.srv

        Field mapping (request):
          value   → request.data  (bool; True = start, False = stop autonomous mapping)
          cmd_num → (dedup guard, NOT forwarded to ROS2)

        Field mapping (response):
          success → bool
          message → string
        """
        inner = payload if not isinstance(
            payload.get('start_assistant_build_map'), dict) \
            else payload['start_assistant_build_map']

        req = SetBool.Request()
        req.data = bool(inner.get('value', True))     # bool

        resp = self.call_service(self.cli_start_assistant_mapping, req)
        if resp is None:
            return {'result': 1,
                    'msg': 'start_assistant_mapping timeout or unavailable'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'start_assistant_build_map_respond'}

    def handle_get_preview_cover_path(self, payload: dict) -> dict:
        """Handle MQTT ``get_preview_cover_path`` — serve the cached preview path.

        MQTT JSON shape (catalog RE-5 §get_preview_cover_path,
        decompile:319628):
          { "get_preview_cover_path": <any> }

        ROS 2 endpoint: NONE.
        The stock mqtt_node does NOT make a ROS2 service call for this
        command.  Instead, `api_get_preview_cover_path` reads the file
          /userdata/lfi/maps/home0/planned_path/preview_planned_path.json
        and publishes its content directly back to the app on
        `Dart/Receive_mqtt/<SN>`.

        # NOTE: No cli_* for this command — no ROS2 service client is
        # wired (or needed) in __init__.  The handler reads the on-disk
        # JSON file and returns its parsed content.  Because the open
        # mqtt_node must avoid the stock buffer-overflow bug (see
        # research/memory/get-preview-cover-path-crash.md), we let the
        # caller stream the file in chunks or use a size guard — that
        # logic lives in the MQTT publisher, not here.  This method only
        # reads + deserialises.

        CRITICAL: stock mqtt_node overflows its send buffer for large
        preview paths.  See research/memory/get-preview-cover-path-crash.md.
        """
        import json
        import os

        preview_path_file = (
            '/userdata/lfi/maps/home0/planned_path/preview_planned_path.json'
        )
        if not os.path.exists(preview_path_file):
            log.warning('handle_get_preview_cover_path: file not found: %s',
                        preview_path_file)
            return {'result': 1, 'msg': 'preview_planned_path.json not found'}

        try:
            with open(preview_path_file, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            log.warning('handle_get_preview_cover_path: read error: %s', exc)
            return {'result': 1, 'msg': f'read error: {exc}'}

        # Caller (MQTT publisher) wraps this in the respond envelope.
        # Return the parsed data so the publisher can forward it verbatim.
        return {'result': 0, 'msg': 'get_preview_cover_path_respond',
                'data': data}

    def handle_stop_scan_map(self, payload: dict) -> dict:
        """Handle MQTT ``stop_scan_map`` — stop the active mapping recorder.

        MQTT JSON shape (catalog RE-5 §stop_scan_map):
          { "stop_scan_map": { "value": <bool>, ... } }

        ROS 2 endpoint: /robot_decision/map_stop_record  (std_srvs/srv/SetBool)
        Schema: research/ros2_msg_definitions/std_srvs/srv/SetBool.srv

        Field mapping (per CLAUDE.md "BLE Mapping" + catalog):
          data = body.value (default True for unicom; False for obstacle stop)
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('stop_scan_map', payload)
            if isinstance(payload.get('stop_scan_map'), dict)
            else payload)
        req = SetBool.Request()
        if isinstance(inner, dict) and 'value' in inner:
            req.data = bool(inner.get('value'))
        else:
            req.data = True
        resp = self.call_service(self.cli_map_stop_record, req)
        if resp is None:
            return {'result': 1, 'msg': 'map_stop_record timeout'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'stop_scan_map_respond'}

    def handle_start_erase_map(self, payload: dict) -> dict:
        """Handle MQTT ``start_erase_map`` — begin obstacle/area erase.

        MQTT JSON shape (catalog RE-5 §start_erase_map):
          { "start_erase_map": { "mapName": "<string>" } }

        ROS 2 endpoint: /robot_decision/start_erase  (std_srvs/srv/SetBool)
        Schema: research/ros2_msg_definitions/std_srvs/srv/SetBool.srv

        Field mapping:
          data = True  (start)

        The mapName field is reserved by the request body but not part
        of the SetBool schema — the decision node correlates it from
        the active mapping context.
        """
        req = SetBool.Request()
        req.data = True
        resp = self.call_service(self.cli_start_erase, req)
        if resp is None:
            return {'result': 1, 'msg': 'start_erase timeout'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'start_erase_map_respond'}

    def handle_stop_erase_map(self, payload: dict) -> dict:
        """Handle MQTT ``stop_erase_map`` — stop the erase operation.

        Same client as start_erase_map, opposite SetBool data value.
        Catalog RE-5 §stop_erase_map line 80: "Same client as
        start_erase, opposite bool".
        """
        req = SetBool.Request()
        req.data = False
        resp = self.call_service(self.cli_start_erase, req)
        if resp is None:
            return {'result': 1, 'msg': 'start_erase timeout'}
        return {'result': 0 if resp.success else 1,
                'msg': resp.message or 'stop_erase_map_respond'}

    def handle_reset_map(self, payload: dict) -> dict:
        """Handle MQTT ``reset_map`` — clear a map's recorded data.

        MQTT JSON shape (catalog RE-5 §reset_map):
          { "reset_map": { "mapName": "<string>" } }

        ROS 2 endpoint: /robot_decision/reset_mapping  (decision_msgs/srv/StartMap)
        Schema: research/ros2_msg_definitions/decision_msgs/srv/StartMap.srv

        Field mapping:
          map_name = body.mapName
          map_type = 0
          model    = 0
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('reset_map', payload)
            if isinstance(payload.get('reset_map'), dict)
            else payload)
        map_name = ''
        if isinstance(inner, dict):
            map_name = str(inner.get('mapName', ''))
        req = StartMap.Request()
        req.mapname = map_name
        req.type = 0
        req.model = ''
        resp = self.call_service(self.cli_reset_mapping, req)
        if resp is None:
            return {'result': 1, 'msg': 'reset_mapping timeout'}
        return {'result': 0 if resp.result else 1,
                'msg': resp.data or 'reset_map_respond'}

    def handle_generate_preview_cover_path(self, payload: dict) -> dict:
        """Handle MQTT ``generate_preview_cover_path``.

        MQTT JSON shape (catalog RE-5 §generate_preview_cover_path):
          { "generate_preview_cover_path": {
              "map_ids": <int>,
              "cov_direction": <int>,
              "specify_direction": <bool>
          } }

        ROS 2 endpoint: /robot_decision/generate_preview_cover_path
        Endpoint type: decision_msgs/srv/GenerateCoveragePath
        Schema: research/ros2_msg_definitions/decision_msgs/srv/GenerateCoveragePath.srv
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('generate_preview_cover_path', payload)
            if isinstance(payload.get('generate_preview_cover_path'), dict)
            else payload)
        req = GenerateCoveragePath.Request()
        if isinstance(inner, dict):
            try:
                req.map_ids = int(inner.get('map_ids', 0))
            except (TypeError, ValueError):
                req.map_ids = 0
            try:
                req.cov_direction = float(inner.get('cov_direction', 0.0))
            except (TypeError, ValueError):
                req.cov_direction = 0.0
            req.specify_direction = bool(inner.get('specify_direction', False))
        resp = self.call_service(self.cli_generate_preview_path, req)
        if resp is None:
            return {'result': 1, 'msg': 'generate_preview_cover_path timeout'}
        return {'result': 0 if resp.result else 1,
                'msg': resp.message or 'generate_preview_cover_path_respond'}

    def handle_get_recharge_pos(self, payload: dict) -> dict:
        """Handle MQTT ``get_recharge_pos`` — read the saved charging pose.

        Same client as save_recharge_pos but with control_mode=0
        (read). Catalog RE-5 §get_recharge_pos.

        ROS 2 endpoint: /robot_decision/save_charging_pose
        Endpoint type: mapping_msgs/srv/SetChargingPose
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('get_recharge_pos', payload)
            if isinstance(payload.get('get_recharge_pos'), dict)
            else payload)
        map_name = ''
        if isinstance(inner, dict):
            map_name = str(inner.get('mapName', ''))
        req = SetChargingPose.Request()
        req.control_mode = 0           # 0 = read
        req.map_file_name = map_name
        req.child_map_file_name = map_name
        resp = self.call_service(self.cli_save_charging_pose, req)
        if resp is None:
            return {'result': 1, 'msg': 'save_charging_pose timeout'}
        return {'result': 0 if resp.result else 1,
                'msg': resp.message or 'get_recharge_pos_respond',
                'mapName': map_name}

    def handle_dev_pin_info(self, payload: dict) -> dict:
        """Handle MQTT ``dev_pin_info`` — chassis PIN-code set/clear.

        MQTT JSON shape (catalog RE-5 §dev_pin_info, decompile:347003):
          { "dev_pin_info": { "type": <int>, "code": <string> } }

        ROS 2 endpoint: /chassis_pin_code_set  (action)
        Schema: research/ros2_msg_definitions/novabot_msgs/action/ChassisPinCodeSet.action

        We send_goal_async and immediately ack with `result:0`. Stock
        binary fires-and-forgets; the action server signals back via
        chassis_incident, not via a synchronous response.
        """
        inner = payload if not isinstance(payload, dict) else (
            payload.get('dev_pin_info', payload)
            if isinstance(payload.get('dev_pin_info'), dict)
            else payload)
        if not isinstance(inner, dict):
            return {'result': 1, 'msg': 'invalid_body'}
        if self._shadow_mode:
            log.info('SHADOW: would send ChassisPinCodeSet goal: %r', inner)
            return {'result': 0, 'msg': 'shadow'}
        goal = ChassisPinCodeSet.Goal()
        try:
            goal.type = int(inner.get('type', 0))
        except (TypeError, ValueError):
            goal.type = 0
        goal.code = str(inner.get('code', ''))
        if not self.act_chassis_pin_code_set.wait_for_server(timeout_sec=1.0):
            return {'result': 1, 'msg': 'pin_code_set_unavailable'}
        self.act_chassis_pin_code_set.send_goal_async(goal)
        return {'result': 0, 'msg': 'dev_pin_info_respond'}

    def handle_save_recharge_pos(self, payload: dict) -> dict:
        """Handle MQTT ``save_recharge_pos`` — write charging pose to map.

        MQTT JSON shape (catalog RE-5 §save_recharge_pos,
        decompile:346293):
          { "save_recharge_pos": { "cmd_num": <int>, "mapName": "<string>" } }

        ROS 2 endpoint: /robot_decision/save_charging_pose
        Endpoint type:  mapping_msgs/srv/SetChargingPose
        Schema: research/ros2_msg_definitions/mapping_msgs/srv/SetChargingPose.srv

        Field mapping (request):
          control_mode       = 1  (write operation; 0 = read per schema comment)
          map_file_name      → mapName from payload (total-map name, e.g. "map0")
          child_map_file_name → mapName from payload (sub-map name; exact
                                split <unknown — needs Ghidra deep-dive of
                                api_save_recharge_pos:346293>; using mapName
                                for both until Ghidra clarifies)

        Field mapping (response):
          result  → bool (True = success)
          message → string
          NOTE: `map_to_charging_dis` (float32) is present in the response
          schema but is NOT read here — the stock mqtt_node does not
          forward it to the app (audit C2, open-decision project).

        Post-condition: Flutter sends `save_map type:1` 500ms after
        `save_recharge_pos_respond` (see CLAUDE.md §BLE Mapping).
        """
        inner = payload if not isinstance(payload.get('save_recharge_pos'), dict) \
            else payload['save_recharge_pos']

        map_name = str(inner.get('mapName', ''))  # e.g. "map0"

        req = SetChargingPose.Request()
        req.control_mode = 1           # uint8 — 1 = write
        req.map_file_name = map_name   # string — total map name
        # child_map_file_name: exact decompile mapping unknown (Ghidra needed);
        # using mapName verbatim — same field the stock binary most likely
        # passes per catalog note (api_save_recharge_pos:346293).
        req.child_map_file_name = map_name  # string

        resp = self.call_service(self.cli_save_charging_pose, req)
        if resp is None:
            return {'result': 1, 'msg': 'save_charging_pose timeout or unavailable'}
        # NOTE: resp.map_to_charging_dis intentionally NOT read (audit C2).
        return {'result': 0 if resp.result else 1,
                'msg': resp.message or 'save_recharge_pos_respond'}

    # ── Movement (manual joystick) ─────────────────────────────────────
    #
    # Flow per CLAUDE.md "Manual Control (Joystick) Protocol":
    #   1. App sends `start_move <int 1..4>` to set the initial direction.
    #   2. App streams `mst {x_w, y_v, z_g}` every 200 ms while held.
    #   3. App sends `stop_move {}` to release.
    #
    # All three publish a CloudMoveCmd on `/cloud_move_cmd`. The chassis
    # node consumes it and drives the wheels. There is no service call —
    # the publisher rate IS the velocity.
    #
    # x_w → linear_x   (forward/back, m/s)
    # y_v → angular_wheel (turn rate, rad/s)
    # z_g  is unused on the mower chassis (always 0 in app traffic).

    def _publish_cloud_move_cmd(self, linear_x: float,
                                angular_wheel: float) -> None:
        """Single-shot CloudMoveCmd publish with current ROS time stamp."""
        if self._shadow_mode:
            log.info('SHADOW: would publish CloudMoveCmd '
                     'linear_x=%.3f angular_wheel=%.3f',
                     linear_x, angular_wheel)
            return
        msg = CloudMoveCmd()
        msg.stamp = self.get_clock().now().to_msg()
        msg.linear_x = float(linear_x)
        msg.angular_wheel = float(angular_wheel)
        self.pub_cloud_move_cmd.publish(msg)

    def handle_start_move(self, payload) -> dict:
        """Handle MQTT ``start_move <int>`` — enter manual joystick mode.

        Stock binary expects an INTEGER body (not an object). 1=left,
        2=right, 3=forward, 4=backward (catalog RE-5 §start_move,
        memory `mqtt-whitelist-flow.md` confirms the int form is the
        only one the stock binary accepts).

        Empty object `{}` does NOT work — firmware silently drops it.
        We ack non-int bodies but skip publishing so the caller still
        gets a response.
        """
        direction = payload if isinstance(payload, int) else None
        if direction is None and isinstance(payload, dict):
            # Some app revisions wrap in {value: <int>}; tolerate both.
            v = payload.get('value')
            if isinstance(v, int):
                direction = v
        if direction is None or direction not in _START_MOVE_DEFAULTS:
            log.warning('handle_start_move: invalid direction %r '
                        '(expected int 1..4)', payload)
            return {'result': 1, 'msg': 'invalid_direction'}
        linear_x, angular_wheel = _START_MOVE_DEFAULTS[direction]
        self._publish_cloud_move_cmd(linear_x, angular_wheel)
        log.info('start_move: direction=%d linear_x=%.2f angular_wheel=%.2f',
                 direction, linear_x, angular_wheel)
        return {'result': 0}

    def handle_mst(self, payload) -> dict:
        """Handle MQTT ``mst {x_w, y_v, z_g}`` — continuous joystick velocity.

        Source: CLAUDE.md "Manual Control (Joystick) Protocol".
        Repeats at 200 ms during a touch-hold; we publish unconditionally
        — the chassis side handles velocity smoothing.
        """
        if not isinstance(payload, dict):
            return {'result': 1, 'msg': 'invalid_body'}
        try:
            linear_x = float(payload.get('x_w', 0.0))
            angular_wheel = float(payload.get('y_v', 0.0))
        except (TypeError, ValueError):
            return {'result': 1, 'msg': 'invalid_velocity'}
        self._publish_cloud_move_cmd(linear_x, angular_wheel)
        # mst is high-rate — no response needed (return None to suppress).
        return None

    def handle_stop_move(self, payload) -> dict:
        """Handle MQTT ``stop_move`` — leave manual mode.

        Publishes a single zero-velocity CloudMoveCmd which the chassis
        treats as a brake. Body is ignored (stock binary takes any).
        """
        self._publish_cloud_move_cmd(0.0, 0.0)
        log.info('stop_move: zero velocity published')
        return {'result': 0}

    # ── Generic helpers ────────────────────────────────────────────────
    def call_service(self, client, request, timeout: float = 5.0):
        """Synchronous service call. Returns response or None on timeout.

        We use call_async + manual wait inside a MultiThreadedExecutor
        callback group rather than blocking on a single-threaded executor
        — same pattern open_decision uses.
        """
        if self._shadow_mode:
            log.info('SHADOW: would call %s with %r',
                     client.srv_name, request)
            return None
        if not client.wait_for_service(timeout_sec=1.0):
            log.warning('ros2_bridge: %s not available', client.srv_name)
        future = client.call_async(request)
        # Spinning is the executor's job; we just await the future
        import time
        deadline = time.monotonic() + timeout
        while not future.done():
            if time.monotonic() > deadline:
                log.warning('ros2_bridge: %s timed out', client.srv_name)
                return None
            time.sleep(0.05)
        try:
            return future.result()
        except Exception as e:
            log.warning('ros2_bridge: %s raised: %s', client.srv_name, e)
            return None
