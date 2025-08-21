#!/usr/bin/env bash
set -euo pipefail

echo ">>> Ejecutando pipeline..."

# Scripts Node.js
echo "-> Ejecutando 01split-ccaa.js"
node scripts/01split-ccaa.js

echo "-> Ejecutando 02stats.js"
node scripts/02stats.js

echo "-> Ejecutando 04-evol.js"
node scripts/04-evol.js

echo "-> Ejecutando 05-join-monty.js"
node scripts/05-join-monty.js

# Scripts Bash
echo "-> Ejecutando 05-small.sh"
./05-small.sh

echo "-> Ejecutando 06-small.sh"
./06-small.sh

echo "-> Ejecutando move-perimeters"
./move-perimters.sh

echo "-> Ejecutando 07-ourense.sh"
./07-ourense.sh

echo ">>> Pipeline terminado con éxito ✅"
