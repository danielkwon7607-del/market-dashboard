#!/usr/bin/env bash
# Start the dashboard: ./run.sh  →  http://localhost:8050
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
exec .venv/bin/python server.py
