# Crear entorno
python3 -m venv venv

# Activar entorno
source venv/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install geopandas shapely pyproj svgwrite cairosvg rtree mapclassify matplotlib

# Guardar dependencias
pip freeze > requirements.txt

# Ejecutar script
python scripts/03small-multiples-scale.py \
  --in data/ES_2025_fuegos.geojson \
  --out data/ES_2025_smallmultiples_scale_key.svg \
  --cols 10 \
  --cell 64 \
  --margin 24 \
  --stroke 0.4 \
  --label

# Exportar a PDF
# cairosvg data/ES_2025_smallmultiples.svg -o data/ES_2025_smallmultiples.pdf

# Salir del entorno
deactivate
