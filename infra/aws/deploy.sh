#!/usr/bin/env bash
# Corre ESTO en la instancia EC2, parado en cualquier lado (se ubica solo).
# Primera vez: cloná el repo en /home/ec2-user/sharegrams antes de usar esto.
#
# Uso:
#   VITE_API_URL=http://TU-IP-PUBLICA:3000 ./infra/aws/deploy.sh
set -euo pipefail

: "${VITE_API_URL:?Definí VITE_API_URL, ej: VITE_API_URL=http://TU-IP-PUBLICA:3000 ./infra/aws/deploy.sh}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

echo "== git pull =="
git pull

echo "== instalar dependencias =="
npm ci

echo "== build uml-core =="
npm run build --workspace=@sharegrams/uml-core

echo "== generar cliente Prisma y aplicar migraciones (RDS) =="
npm exec --workspace=@sharegrams/api -- prisma generate
npm exec --workspace=@sharegrams/api -- prisma migrate deploy

echo "== build api (NestJS) =="
npm run build --workspace=@sharegrams/api

echo "== build web (apunta a $VITE_API_URL) =="
VITE_API_URL="$VITE_API_URL" npm run build --workspace=@sharegrams/web

echo "== publicar el build del web para nginx =="
sudo mkdir -p /var/www/sharegrams/web
sudo rm -rf /var/www/sharegrams/web/*
sudo cp -r apps/web/dist/* /var/www/sharegrams/web/

echo "== reiniciar el backend =="
sudo systemctl restart sharegrams-api

echo ""
echo "Listo."
echo "  Backend: sudo systemctl status sharegrams-api"
echo "  Web:     http://<tu-ip-publica>/  (puerto 80, vía nginx)"
echo "  API:     $VITE_API_URL"
