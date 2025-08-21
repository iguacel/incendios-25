#!/usr/bin/env bash
set -euo pipefail

echo ">>> Activando venv"
source ./venv/bin/activate

echo ">>> Instalando deps Python"
pip install --quiet geopandas shapely fiona pyproj pandas

echo ">>> Generando CSV evolución CCAA 2016–2025"
python scripts/13-evo_ccaa_2016_2025.py

echo ">>> Subiendo a Google Sheets (evo-ccaa-sose)"
node scripts/13-evo_ccaa_2016_2025.js

echo ">>> Done ✅"