#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "Virtual environment not found. Run setup first:"
  echo "  python3.13 -m venv .venv"
  echo "  source .venv/bin/activate"
  echo "  pip install -r requirements.txt"
  exit 1
fi

.venv/bin/python scripts/patch_continuum_aura.py

exec .venv/bin/python server.py "$@"
