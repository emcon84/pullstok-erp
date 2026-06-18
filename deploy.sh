#!/bin/bash

# Script de Deployment Automatizado para VPS
# Este script debe ejecutarse EN EL VPS, no en tu máquina local

set -e  # Salir si hay errores

echo "🚀 Iniciando deployment de Nexo..."

# Variables - MODIFICA ESTAS SEGÚN TU CONFIGURACIÓN
PROJECT_DIR="/var/www/nexo"
API_DIR="$PROJECT_DIR/api"
FRONTEND_DIR="$PROJECT_DIR/nexo-front"
FRONTEND_BUILD_DIR="/var/www/nexo-front"

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que estamos en el directorio correcto
if [ ! -d "$PROJECT_DIR" ]; then
    print_error "El directorio $PROJECT_DIR no existe. Por favor ajusta la variable PROJECT_DIR en el script."
    exit 1
fi

cd "$PROJECT_DIR"

# Paso 1: Actualizar código (si usas Git)
print_message "Actualizando código desde Git..."
if git pull; then
    print_message "✅ Código actualizado"
else
    print_warning "No se pudo hacer git pull. Si no usas Git, ignora este mensaje."
fi

# Paso 2: Actualizar API
print_message "📦 Actualizando API..."
cd "$API_DIR"

print_message "Instalando dependencias de la API..."
npm install --production

print_message "Compilando la API..."
npm run build

print_message "Reiniciando PM2..."
pm2 restart nexo-api || pm2 start ecosystem.config.js

print_message "✅ API actualizada"

# Paso 3: Actualizar Frontend
print_message "🎨 Actualizando Frontend..."
cd "$FRONTEND_DIR"

print_message "Instalando dependencias del frontend..."
npm install

print_message "Compilando el frontend..."
npm run build

print_message "Copiando archivos compilados..."
sudo mkdir -p "$FRONTEND_BUILD_DIR"
sudo cp -r dist/* "$FRONTEND_BUILD_DIR/"
sudo chown -R www-data:www-data "$FRONTEND_BUILD_DIR"

print_message "✅ Frontend actualizado"

# Paso 4: Reiniciar Nginx
print_message "🔄 Reiniciando Nginx..."
sudo systemctl restart nginx

# Paso 5: Verificar estado
print_message "📊 Verificando estado de servicios..."

echo ""
print_message "Estado de PM2:"
pm2 status

echo ""
print_message "Estado de Nginx:"
sudo systemctl status nginx --no-pager -l

echo ""
print_message "🎉 ¡Deployment completado!"
echo ""
print_message "Verifica los logs con:"
echo "  - API: pm2 logs nexo-api"
echo "  - Nginx: sudo tail -f /var/log/nginx/error.log"
echo ""
