# Activar tu venv si procede
source venv/bin/activate

python scripts/04-small-multiples_bigfires_2016_2025.py \
  --data data \
  --out data/SM_bigfires_2016_2025.svg \
  --min-ha 500 \
  --cols 10 \
  --cell 64 \
  --margin 24 \
  --stroke 0.4 \
  --label
