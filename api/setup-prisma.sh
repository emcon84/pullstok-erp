#!/bin/bash

# Script para instalar Prisma y configurar PostgreSQL
# Ejecutar este script EN EL VPS dentro de /var/www/nexo/api

set -e

echo "🔧 Instalando Prisma..."

# Instalar Prisma CLI y Client
npm install prisma --save-dev
npm install @prisma/client

echo "✅ Prisma instalado"

# Copiar el archivo .env de producción
if [ -f .env.production ]; then
    cp .env.production .env
    echo "📝 Archivo .env configurado (recuerda actualizar la contraseña de PostgreSQL)"
else
    echo "⚠️  No se encontró .env.production, crea el archivo .env manualmente"
fi

echo ""
echo "🎯 Próximos pasos:"
echo "1. Edita el archivo .env y actualiza DATABASE_URL con tu contraseña de PostgreSQL"
echo "2. Ejecuta: npx prisma generate"
echo "3. Ejecuta: npx prisma migrate dev --name init"
echo "4. Ejecuta: npm run seed (para crear usuario de prueba)"
echo ""
