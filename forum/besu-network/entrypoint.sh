#!/bin/sh
set -e
# Copy node key into data dir on first run (so a mounted volume doesn't hide the key)
if [ ! -f /opt/besu/data/key ]; then
  cp /opt/besu/node-key-seed /opt/besu/data/key
  chown besu:besu /opt/besu/data/key 2>/dev/null || true
fi
exec /opt/besu/bin/besu "$@"
