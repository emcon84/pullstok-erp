#!/bin/bash
#
# Redeploy para Pullstok ERP en el VPS de producción.
# Se ejecuta EN EL VPS, parado sobre el clon de
#   https://github.com/emcon84/pullstok-erp
# en /var/www/pullstok.
#
# Se corre como el usuario "deploy" (o via self-hosted runner de GitHub Actions).
# Los comandos privilegiados (nginx, pm2 de pullstok-api, pg_dump) se invocan
# con sudo+NOPASSWD restringido en /etc/sudoers.d/pullstok-deploy — NUNCA root libre.
#
# Seguridad habilitada:
#   1. Backup de la BD ANTES de tocar nada (rollback / restauración inmediata).
#   2. Health check post-deploy de la API (/api/health) y del FRONT (app.pullstok.com).
#   3. Auto-rollback al commit anterior si cualquier check falla.
#
# No hace seeding (paso manual aparte) y nunca toca api/uploads/.

set -euo pipefail

PROJECT_DIR="/var/www/pullstok"
API_DIR="$PROJECT_DIR/api"
PM2_APP_NAME="pullstok-api"
BACKUP_DIR="/var/backups/pullstok"
DATABASE="pullstok"

# Health checks
# API: el endpoint real es /api/health (sin prefijo da 404). Se valida por localhost directo.
# FRONT: el negocio vive en app.pullstok.com (servido por nginx desde localhost:80 no matchea
# ningún server_name, por eso se valida la URL pública que sirve pullstok-front/dist).
API_HEALTH_URL="http://127.0.0.1:5000/api/health"
FRONT_HTTP_URL="https://app.pullstok.com"
EXPECTED_HTTP=200

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
if [ "$(id -u)" = "0" ]; then
    fail "Este script NO debe correrse como root. Ejecutalo como el usuario deploy."
    exit 1
fi

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 0) CAPTURAR COMMIT ANTERIOR (para auto-rollback)
# ---------------------------------------------------------------------------
PREVIOUS_COMMIT=$(git rev-parse HEAD)
step "[0/9] Commit actual capturado para rollback: ${PREVIOUS_COMMIT:0:12}"

# ---------------------------------------------------------------------------
# 1) BACKUP DE LA BASE ANTES DE CUALQUIER CAMBIO
# ---------------------------------------------------------------------------
step "[1/9] Backup de PostgreSQL ($DATABASE, pre-deploy)..."
mkdir -p "$BACKUP_DIR"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pullstok_predeploy_$DATE.dump"
if sudo -n -u postgres pg_dump -Fc pullstok > "$BACKUP_FILE"; then
    echo "✅ Backup pre-deploy: $BACKUP_FILE"
    find "$BACKUP_DIR" -name "pullstok_predeploy_*.dump" -mtime +7 -delete
else
    warn "El backup pre-deploy falló. Continúo (sin red de seguridad contra migraciones rotas)."
fi

# ---------------------------------------------------------------------------
# 2) ACTUALIZAR CODIGO
# ---------------------------------------------------------------------------
step "[2/9] Actualizando código desde Git..."
git pull
echo "✅ Código actualizado"

# ---------------------------------------------------------------------------
# 3) DEPENDENCIAS (nunca interactivo: un deploy automatizado no puede quedarse
#    esperando input. CI=true evita los prompts de pnpm, incluida la purga
#    de node_modules cuando cambia la versión.)
# ---------------------------------------------------------------------------
step "[3/9] Instalando dependencias (pnpm, monorepo completo)..."
export CI=true
if pnpm install --frozen-lockfile --config.confirmModulesPurge=false; then
    echo "✅ Instalado con --frozen-lockfile"
else
    warn "Falló --frozen-lockfile (probablemente lockfile desactualizado). Reintentando con --no-frozen-lockfile..."
    pnpm install --no-frozen-lockfile --config.confirmModulesPurge=false
    echo "✅ Instalado con --no-frozen-lockfile"
fi

# ---------------------------------------------------------------------------
# 4) PRISMA CLIENT + BUILD
# ---------------------------------------------------------------------------
step "[4/9] Generando Prisma Client..."
pnpm --filter ./api exec prisma generate
echo "✅ Prisma Client generado"

step "[5/9] Compilando todos los workspaces (api, pullstok-front, pullstok-landing)..."
pnpm -r build
echo "✅ Build completo (api/dist/bundle.js, pullstok-front/dist, pullstok-landing/dist)"

# ---------------------------------------------------------------------------
# 6) MIGRACIONES
# ---------------------------------------------------------------------------
step "[6/9] Aplicando migraciones de Prisma..."
(
    cd "$API_DIR"
    set -a
    . ./.env
    set +a
    pnpm exec prisma migrate deploy
)
echo "✅ Migraciones aplicadas"

# ---------------------------------------------------------------------------
# 7) REINICIAR PM2 (pullstok-api SOLO)
# ---------------------------------------------------------------------------
step "[7/9] Reiniciando proceso PM2 ($PM2_APP_NAME)..."
(
    cd "$API_DIR"
    set -a
    . ./.env
    set +a
    if sudo -n pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
        sudo -n pm2 restart "$PM2_APP_NAME" --update-env
    else
        warn "El proceso $PM2_APP_NAME no existe en PM2; intentando arrancarlo..."
        sudo -n pm2 start dist/bundle.js --name "$PM2_APP_NAME" \
            || warn "No se pudo crear el proceso: crealo manualmente como root."
    fi
)
sudo -n pm2 save
echo "✅ PM2 actualizado y persistido"

# ---------------------------------------------------------------------------
# 8) RECARGAR NGINX
# ---------------------------------------------------------------------------
step "[8/9] Recargando Nginx..."
sudo -n nginx -t
sudo -n systemctl reload nginx
echo "✅ Nginx recargado"

# ---------------------------------------------------------------------------
# 9) HEALTH CHECK + AUTO-ROLLBACK (API y FRONT)
# ---------------------------------------------------------------------------
step "[9/9] Health check post-deploy (API + FRONT)..."
api_ok=false
front_ok=false

sleep 3
api_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$API_HEALTH_URL" || echo "000")
if [ "$api_code" = "$EXPECTED_HTTP" ]; then
    api_ok=true
    echo "✅ API OK ($API_HEALTH_URL -> HTTP $api_code)"
else
    echo "❌ API falló ($API_HEALTH_URL -> HTTP $api_code)"
fi

front_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$FRONT_HTTP_URL" || echo "000")
if [ "$front_code" = "$EXPECTED_HTTP" ]; then
    front_ok=true
    echo "✅ FRONT OK ($FRONT_HTTP_URL -> HTTP $front_code)"
else
    echo "❌ FRONT falló ($FRONT_HTTP_URL -> HTTP $front_code)"
fi

if $api_ok && $front_ok; then
    echo ""
    echo -e "${GREEN}🎉 Deploy completado. Sistema sano (API + FRONT).${NC}"
else
    fail "Health check no pasó. Ejecutando AUTO-ROLLBACK al commit $PREVIOUS_COMMIT..."
    git checkout --force "$PREVIOUS_COMMIT"
    pnpm -r build
    (
        cd "$API_DIR"
        set -a; . ./.env; set +a
        sudo -n pm2 restart "$PM2_APP_NAME" --update-env
    )
    sudo -n nginx -t
    sudo -n systemctl reload nginx
    fail "Auto-rollback completado al commit ${PREVIOUS_COMMIT:0:12}. Revisar logs."
    exit 1
fi

echo ""
echo "Verificá con:"
echo "  pm2 status"
echo "  pm2 logs $PM2_APP_NAME --lines 50"
echo ""
echo "Recordatorios:"
echo "  - No seedea la base."
echo "  - api/uploads/ quedó intacta (nunca se toca)."