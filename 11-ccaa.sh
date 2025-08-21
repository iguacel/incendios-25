#!/usr/bin/env bash
set -euo pipefail

echo ">>> Activando entorno Python"
# Ajusta esta ruta a tu venv si no es la correcta
source ./venv/bin/activate

echo ">>> Instalando dependencias Python"
pip install --quiet geopandas shapely fiona pyproj pandas

echo ">>> Ejecutando análisis de autonomías (Python)"
python scripts/11-ccaa_burn_2025.py

echo ">>> Subiendo resultados a Google Sheets (Node)"
node scripts/11-push_ccaa_2025.js

echo ">>> Pipeline terminado con éxito ✅"
