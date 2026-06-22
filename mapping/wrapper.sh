#!/bin/bash
# wrapper.sh — installed in place of the stock novabot_mapping binary.
# novabot_launch execs this; it starts the open Python node with correct DDS
# timing (no kill/restart). Mirrors mower/ robot_decision wrapper strategy.
export ROS_LOCALHOST_ONLY=1
DEPLOY_DIR=/userdata/open_mapping
source /root/novabot/install/setup.bash 2>/dev/null
exec python3 -m open_mapping.node "$@" >>"$DEPLOY_DIR/mapping.log" 2>&1
