"""rclpy ROS2 node for the open mapping node (Phase 0: stub responses).

rclpy is imported lazily inside main() so this module imports on any machine
(tests run the pure build_service_specs() / handle() without ROS). Phase 1+
wires `handle` to open_mapping.core.
"""
from open_mapping.services import SERVICES


def build_service_specs():
    """(name, msg_type, handler) for every service the node registers."""
    return [(s.name, s.msg_type, s.handler) for s in SERVICES]


def handle(handler: str, request_fields: dict) -> dict:
    """Phase 0 stub: acknowledge every call without doing work.

    Returns the union of fields the mapping_msgs responses use; the ROS layer
    copies the relevant ones onto the concrete response message. `result=True`,
    `error_code=0` (Mapping), benign defaults elsewhere.
    """
    known = {s.handler for s in SERVICES}
    if handler not in known:
        return {"result": False, "message": f"unknown handler: {handler}", "error_code": 0}
    return {"result": True, "message": "open-mapping phase0 stub", "error_code": 0}


def main(args=None):
    import rclpy
    from rclpy.node import Node

    rclpy.init(args=args)
    node = Node("novabot_mapping")  # claim the stock node name
    node.get_logger().warn("open-mapping PHASE 0 stub node — services acknowledge only")
    # Phase 1+: import the concrete mapping_msgs srv types and register a
    # service per build_service_specs() that deserializes -> handle() -> response.
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
