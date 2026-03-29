#!/bin/bash

# Ensure you're logged into Surge (only needed once per machine)
# surge login --email you@example.com --token your-token

# Set these values
PROJECT_DIR="html"  # or the path to your build folder
DOMAIN="warzone-minesweeper.surge.sh"  # customize this

# Deploy
echo "🚀 Deploying to Surge..."
npx surge $PROJECT_DIR $DOMAIN