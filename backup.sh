#!/bin/bash
#
# Backup de la base de datos PostgreSQL "pullstok" en el VPS de producción.
# Pensado para correr vía cron como root (o con sudo).
#
# Gotcha de permisos: pg_dump corre como el usuario "postgres", que NO tiene
# permiso de escritura en /root. Por eso este script ejecuta pg_dump con
# salida a stdout (-f - no se usa) y es el proceso root (este script) el que
# redirige esa salida al archivo destino — postgres nunca intenta escribir
# directamente en el filesystem.

set -euo pipefail

# Variables - ajustar según tu configuración
BACKUP_DIR="/root/backups"
DATABASE_NAME="pullstok"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pullstok_backup_$DATE.dump"
RETENTION_DAYS=7  # Mantener backups de los últimos 7 días

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

info "Iniciando backup de PostgreSQL ($DATABASE_NAME)..."

mkdir -p "$BACKUP_DIR"

# sudo -u postgres ejecuta pg_dump y escribe a stdout (-Fc = formato custom,
# comprimido y restaurable con pg_restore); la redirección ">" la hace este
# shell (root), que sí puede escribir en $BACKUP_DIR. Así evitamos que
# postgres necesite permisos sobre /root o cualquier otro directorio.
if sudo -u postgres pg_dump -F c "$DATABASE_NAME" > "$BACKUP_FILE"; then
    info "✅ Backup creado en: $BACKUP_FILE"

    # Eliminar backups antiguos
    find "$BACKUP_DIR" -name "pullstok_backup_*.dump" -mtime +$RETENTION_DAYS -delete
    info "✅ Backups antiguos eliminados (> $RETENTION_DAYS días)"

    info "🎉 Proceso de backup completado"
else
    error "❌ Error al crear el backup"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Para restaurar este backup:
#   sudo -u postgres pg_restore -d pullstok --clean --if-exists /root/backups/pullstok_backup_<fecha>.dump
#
# Para configurar un cron job que ejecute este script diariamente a las 2 AM
# (como root, vía crontab -e o /etc/cron.d):
#   0 2 * * * /var/www/pullstok/backup.sh >> /var/log/pullstok-backup.log 2>&1
