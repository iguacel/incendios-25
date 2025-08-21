# Activar tu venv si procede
source venv/bin/activate

python scripts/05-small-sequence.py \
  --data data \
  --out data/SM_bigfires_2016_2025_sequence.svg \
  --min-ha 500 \
  --cols 10 \
  --cell 64 \
  --margin 24 \
  --stroke 0.0 \
  --label
