#!/usr/bin/env bash
set -e

echo "Atualizando Tek Map..."
git pull
./deploy.sh
