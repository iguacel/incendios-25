#!/usr/bin/env bash
set -euo pipefail

echo ">>> Activando entorno Python"
source ./venv/bin/activate

echo ">>> Instalando dependencias Python"
pip install --quiet geopandas shapely fiona pyproj pandas

echo ">>> Calculando provincias 2025 (Python)"
python scripts/12-provincias_burn_2025.py

echo ">>> Subiendo resultados a Google Sheets (Node)"
node scripts/12-provincias_burn_2025.js

echo ">>> Provincias 2025: todo OK ✅"
