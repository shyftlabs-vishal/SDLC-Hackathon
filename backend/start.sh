#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "Virtual environment not found. Run setup first:"
  echo "  python3.13 -m venv .venv"
  echo "  source .venv/bin/activate"
  echo "  pip install -r requirements.txt"
  echo "  pip install ../../continuum-main"
  exit 1
fi

exec .venv/bin/python server.py "$@"
