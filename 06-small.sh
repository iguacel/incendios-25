# Activar tu venv si procede
source venv/bin/activate

python scripts/06-small-fires-2025.py \
  --data data \
  --out data/SM_bigfires_2025.svg \
  --min-ha 30 \
  --cols 10 \
  --cell 64 \
  --margin 24 \
  --stroke 0.0 \
  --label
