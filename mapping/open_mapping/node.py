"""rclpy ROS2 node for the open mapping node (Phase 1: save_map wired).

rclpy is imported lazily inside main() so this module imports on any machine
(tests run the pure build_service_specs() / handle() without ROS). Phase 1
wires handle("save_map") overlap pre-check and delegates file I/O to save_map.
"""
from open_mapping.services import SERVICES


def build_service_specs():
    """(name, msg_type, handler) for every service the node registers."""
    return [(s.name, s.msg_type, s.handler) for s in SERVICES]


def handle(handler: str, request_fields: dict) -> dict:
    """Dispatch a mapping service request.

    Returns {result, message, error_code}. For save_map, runs the overlap
    pre-check against any geometry fields (new_work, existing_works,
    existing_unicoms) and returns the error_code from check_overlap.
    No file I/O happens here — the live path calls save_map() from the ROS
    callback layer; this pure function is for unit-testable control flow.

    error_code codes (mapping_msgs/srv/Mapping):
      0 = OK, 1 = OVERLAPPING_OTHER_MAP, 2 = OVERLAPPING_OTHER_UNICOM,
      3 = CROSS_MULTI_MAPS.
    """
    known = {s.handler for s in SERVICES}
    if handler not in known:
        return {"result": False, "message": f"unknown handler: {handler}", "error_code": 0}

    if handler == "save_map":
        new_work = request_fields.get("new_work")
        existing_works = request_fields.get("existing_works", [])
        existing_unicoms = request_fields.get("existing_unicoms", [])

        if new_work:
            from open_mapping.core.overlap import check_overlap
            error_code = check_overlap(new_work, existing_works, existing_unicoms)
            if error_code != 0:
                return {
                    "result": False,
                    "message": f"overlap detected (error_code={error_code})",
                    "error_code": error_code,
                }

        return {"result": True, "message": "save_map accepted", "error_code": 0}

    return {"result": True, "message": "open-mapping phase1", "error_code": 0}


def main(args=None):
    import rclpy
    from rclpy.node import Node

    rclpy.init(args=args)
    node = Node("novabot_mapping")  # claim the stock node name
    node.get_logger().warn("open-mapping PHASE 1 stub node — save_map overlap gate wired")
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
