"""ROS2 service NAME -> mapping_msgs TYPE -> core handler key.

The NAMES are the service names mqtt_node's clients connect to. The set below
is the best-known mapping from the RE work; it MUST be verified on the mower
(see Step: verify) with `ros2 service list -t` while the stock node runs, and
reconciled here. Types come from
research/firmware/.../mapping_msgs/share/mapping_msgs/srvs/.
"""
from dataclasses import dataclass

KNOWN_TYPES = {
    "mapping_msgs/srv/Recording",
    "mapping_msgs/srv/Mapping",
    "mapping_msgs/srv/MappingControl",
    "mapping_msgs/srv/SetChargingPose",
    "mapping_msgs/srv/GenerateEmptyMap",
    "mapping_msgs/srv/StopAutoRecording",
    "mapping_msgs/srv/SaveRecording",
}


@dataclass(frozen=True)
class ServiceDef:
    name: str       # ROS service name mqtt_node connects to
    msg_type: str   # mapping_msgs/srv/<Type>
    handler: str    # key into the core dispatch


SERVICES = [
    ServiceDef("start_scan_map",     "mapping_msgs/srv/Recording",        "recording_start"),
    ServiceDef("add_scan_map",       "mapping_msgs/srv/Recording",        "recording_add"),
    ServiceDef("stop_scan_map",      "mapping_msgs/srv/Recording",        "recording_stop"),
    ServiceDef("start_erase_map",    "mapping_msgs/srv/Recording",        "erase_start"),
    ServiceDef("stop_erase_map",     "mapping_msgs/srv/Recording",        "erase_stop"),
    ServiceDef("save_map",           "mapping_msgs/srv/Mapping",          "save_map"),
    ServiceDef("mapping_control",    "mapping_msgs/srv/MappingControl",   "mapping_control"),
    ServiceDef("set_charging_pose",  "mapping_msgs/srv/SetChargingPose",  "set_charging_pose"),
    ServiceDef("generate_empty_map", "mapping_msgs/srv/GenerateEmptyMap", "generate_empty_map"),
    ServiceDef("stop_auto_recording","mapping_msgs/srv/StopAutoRecording","stop_auto_recording"),
    ServiceDef("save_recording",     "mapping_msgs/srv/SaveRecording",    "save_recording"),
]

_BY_NAME = {s.name: s for s in SERVICES}


def by_name(name):
    """Return the ServiceDef for a service name, or None if unknown."""
    return _BY_NAME.get(name)
