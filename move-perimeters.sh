#!/usr/bin/env bash
set -euo pipefail

# Rutas origen
SRC_DIR="/Users/sose/Desktop/incendios-25/data/perimeters"
SRC_JSON="$SRC_DIR/perimeters_top.json"

# Rutas destino
DEST_JSON="/Users/sose/Desktop/sv-incendios-25/src/data/perimeters_top.json"
DEST_PNG_DIR="/Users/sose/Desktop/sv-incendios-25/static/perimeters"

echo ">>> Moviendo perimeters_top.json"
mv -f "$SRC_JSON" "$DEST_JSON"

echo ">>> Copiando PNGs a $DEST_PNG_DIR"
mkdir -p "$DEST_PNG_DIR"
cp -f "$SRC_DIR"/*.png "$DEST_PNG_DIR/"

echo ">>> Todo listo ✅"
