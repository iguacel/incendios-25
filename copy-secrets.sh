#!/bin/bash

# Load the .env file and extract the variable names
set -o allexport
source .env
set +o allexport

# Define the new repository
NEW_REPO="iguacel/ds-template"

# Read the .env file and extract only the variable names
SECRETS=$(grep -v '^#' .env | xargs)

for SECRET in $SECRETS; do
    # Extract the variable name by cutting at the first '='
    VAR_NAME=$(echo $SECRET | cut -d '=' -f 1)

    # Retrieve the secret value from the environment
    VALUE=$(printenv $VAR_NAME)

    # Check if the secret value exists
    if [ -z "$VALUE" ]; then
        echo "Warning: No value found for $VAR_NAME. Skipping..."
        continue
    fi

    # Set the secret in the new repo
    gh secret set $VAR_NAME -b"$VALUE" -R $NEW_REPO
done
