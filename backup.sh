#!/bin/bash

# Script para hacer backup de la base de datos MongoDB
# Ejecutar este script regularmente (por ejemplo, con cron)

set -e

# Variables - MODIFICA SEGÚN TU CONFIGURACIÓN
BACKUP_DIR="/var/backups/mongodb"
DATABASE_NAME="nexo"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/nexo_backup_$DATE"
RETENTION_DAYS=7  # Mantener backups de los últimos 7 días

# Colores
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[INFO]${NC} Iniciando backup de MongoDB..."

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Hacer backup
if mongodump --db "$DATABASE_NAME" --out "$BACKUP_FILE"; then
    echo -e "${GREEN}[INFO]${NC} ✅ Backup creado en: $BACKUP_FILE"
    
    # Comprimir el backup
    tar -czf "$BACKUP_FILE.tar.gz" -C "$BACKUP_DIR" "nexo_backup_$DATE"
    rm -rf "$BACKUP_FILE"
    echo -e "${GREEN}[INFO]${NC} ✅ Backup comprimido: $BACKUP_FILE.tar.gz"
    
    # Eliminar backups antiguos
    find "$BACKUP_DIR" -name "nexo_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    echo -e "${GREEN}[INFO]${NC} ✅ Backups antiguos eliminados (> $RETENTION_DAYS días)"
    
    echo -e "${GREEN}[INFO]${NC} 🎉 Proceso de backup completado"
else
    echo -e "${GREEN}[ERROR]${NC} ❌ Error al crear el backup"
    exit 1
fi

# Para configurar un cron job que ejecute este script diariamente a las 2 AM:
# crontab -e
# Agregar la línea:
# 0 2 * * * /var/www/nexo/backup.sh >> /var/log/nexo-backup.log 2>&1
