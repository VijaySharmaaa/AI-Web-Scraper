#!/usr/bin/env bash
# build script used by Render (also works locally)
set -o errexit

echo "--- building frontend ---"
cd frontend
npm ci
npm run build
cd ..

echo "--- installing backend ---"
pip install -r backend/requirements.txt
