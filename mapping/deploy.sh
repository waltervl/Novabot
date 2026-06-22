#!/bin/bash
# deploy.sh — deploy the open mapping node to the mower via wrapper-replace.
# Phase 0: scaffolding only. Do NOT run plain `deploy` in production until a
# later phase is byte-verified — the stub node would break mapping.
set -e
MOWER=${MOWER_IP:-192.168.0.244}
MOWER_USER=root
DEPLOY_DIR=/userdata/open_mapping
BINARY_DIR=/root/novabot/install/novabot_mapping/lib/novabot_mapping
BINARY=$BINARY_DIR/novabot_mapping
BACKUP=$BINARY_DIR/novabot_mapping.orig
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SSHPASS=novabot
SSH="sshpass -e ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $MOWER_USER@$MOWER"
SCP="sshpass -e scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no"

case "${1:-status}" in
  --status)
    $SSH "test -f $BACKUP && echo 'wrapper INSTALLED (open node active)' || echo 'stock binary active'"
    ;;
  --hot)
    echo ">>> Copying Python files only (no restart)..."
    $SSH "mkdir -p $DEPLOY_DIR/open_mapping"
    $SCP -r "$SCRIPT_DIR/open_mapping/." "$MOWER_USER@$MOWER:$DEPLOY_DIR/open_mapping/"
    ;;
  --rollback)
    echo ">>> Rollback: restore stock binary..."
    $SSH "test -f $BACKUP && cp $BACKUP $BINARY && rm -f $BACKUP && echo restored || echo 'no backup; already stock'"
    ;;
  deploy)
    echo ">>> Deploy: install wrapper in place of stock binary..."
    echo ">>> WARNING: Phase 0 node is a STUB and will break mapping. Abort unless byte-verified."
    $SSH "mkdir -p $DEPLOY_DIR/open_mapping"
    $SCP -r "$SCRIPT_DIR/open_mapping/." "$MOWER_USER@$MOWER:$DEPLOY_DIR/open_mapping/"
    $SCP "$SCRIPT_DIR/wrapper.sh" "$MOWER_USER@$MOWER:$DEPLOY_DIR/wrapper.sh"
    $SSH "test -f $BACKUP || cp $BINARY $BACKUP; cp $DEPLOY_DIR/wrapper.sh $BINARY; chmod +x $BINARY"
    echo ">>> Done. Reboot the mower so novabot_launch starts the wrapper."
    ;;
  *) echo "usage: deploy.sh [deploy|--hot|--rollback|--status]"; exit 1 ;;
esac
