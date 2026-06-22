#!/bin/bash
#
# Script de redeploy para Pullstok ERP en el VPS de producción.
# Se ejecuta EN EL VPS, parado sobre el clon de
#   https://github.com/emcon84/pullstok-erp
# en /var/www/pullstok.
#
# No hace seeding de la base (es un paso manual aparte) y nunca toca
# api/uploads/ (almacenamiento local de imágenes que debe persistir
# entre redeploys).

set -euo pipefail

PROJECT_DIR="/var/www/pullstok"
API_DIR="$PROJECT_DIR/api"
PM2_APP_NAME="pullstok-api"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ ! -d "$PROJECT_DIR" ]; then
    fail "El directorio $PROJECT_DIR no existe."
    exit 1
fi

cd "$PROJECT_DIR"

step "[1/7] Actualizando código desde Git..."
git pull
echo "✅ Código actualizado"

step "[2/7] Instalando dependencias (pnpm, monorepo completo)..."
# Importante: no canalizar pnpm a través de tail/head al chequear el exit
# code, porque entonces "$?" (y el "||" de abajo) reflejan la salida del
# pipe (tail/head), no la de pnpm, y el fallback nunca se dispara.
if pnpm install --frozen-lockfile; then
    echo "✅ Instalado con --frozen-lockfile"
else
    warn "Falló --frozen-lockfile (probablemente el lockfile quedó desactualizado). Reintentando con --no-frozen-lockfile..."
    pnpm install --no-frozen-lockfile
    echo "✅ Instalado con --no-frozen-lockfile"
fi

step "[3/7] Generando Prisma Client..."
pnpm --filter ./api exec prisma generate
echo "✅ Prisma Client generado"

step "[4/7] Compilando todos los workspaces (api, pullstok-front, pullstok-landing)..."
pnpm -r build
echo "✅ Build completo (api/dist/bundle.js, pullstok-front/dist, pullstok-landing/dist)"

step "[5/7] Aplicando migraciones de Prisma..."
(
    cd "$API_DIR"
    set -a
    . ./.env
    set +a
    pnpm exec prisma migrate deploy
)
echo "✅ Migraciones aplicadas"

step "[6/7] Reiniciando proceso PM2 ($PM2_APP_NAME)..."
(
    cd "$API_DIR"
    set -a
    . ./.env
    set +a
    if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
        pm2 restart "$PM2_APP_NAME" --update-env
    else
        warn "El proceso $PM2_APP_NAME no existe en PM2, arrancándolo por primera vez..."
        pm2 start dist/bundle.js --name "$PM2_APP_NAME"
    fi
)
pm2 save
echo "✅ PM2 actualizado y persistido"

step "[7/7] Recargando Nginx..."
sudo nginx -t
sudo systemctl reload nginx
echo "✅ Nginx recargado"

echo ""
echo -e "${GREEN}🎉 Deploy completado.${NC}"
echo ""
echo "Verificá con:"
echo "  pm2 status"
echo "  pm2 logs $PM2_APP_NAME --lines 50"
echo ""
echo "Recordatorios:"
echo "  - Este script NO corre el seed (pnpm --filter ./api exec prisma db seed, o ts-node prisma/seed.ts manual)."
echo "  - api/uploads/ no se tocó ni se va a tocar: ahí vive el contenido subido por los usuarios."
