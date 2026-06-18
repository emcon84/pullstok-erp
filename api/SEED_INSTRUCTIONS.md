# Instrucciones para Poblar la Base de Datos con Datos de Prueba

## 📦 Datos que se crearán

El script de seed creará:

- **1 Usuario administrador** (test@nexo.com / test123)
- **15 Productos de prueba** en diferentes categorías:
  - Electrónica (laptops, monitores, periféricos)
  - Oficina (sillas, escritorios, lámparas)
  - Hogar (cafetera, aspiradora)
  - Herramientas (taladro, set de herramientas)
  - Accesorios (mochilas, cargadores, hubs)
- **5 Clientes de prueba** con nombres y datos variados

## 🚀 Cómo ejecutar el seed

### ⚠️ IMPORTANTE: Primero asegúrate de tener las tablas creadas

Si es la primera vez o después de un reset:

```bash
# 1. Aplicar migraciones para crear las tablas
npx prisma migrate deploy

# 2. Ejecutar el seed
npm run seed
```

### Opción 1: Script npm (recomendado)

```bash
npm run seed
```

### Opción 2: Comando directo

```bash
npx ts-node prisma/seed.ts
```

### Opción 3: Resetear BD completa (solo desarrollo)

```bash
# Borra TODO y aplica migraciones
npx prisma migrate reset

# Si falla, ejecuta manualmente:
npx prisma migrate deploy
npm run seed
```

## 📷 Imágenes de Productos

Todos los productos usan la imagen placeholder ubicada en:

```
/uploads/placeholder.jpg
```

### Para cambiar las imágenes:

1. **Desde el Frontend**:

   - Ve al Dashboard
   - Haz clic en un producto para editarlo
   - Sube una nueva imagen

2. **Manualmente**:
   - Coloca imágenes en la carpeta `/uploads/`
   - Actualiza el producto desde el frontend o directamente en la BD

## 🔄 Re-ejecutar el seed

Si quieres volver a crear los datos de prueba:

```bash
# Solo recrear productos y clientes (mantiene otros datos)
npm run seed

# O resetear TODA la base de datos (solo desarrollo)
npx prisma migrate reset
# Si falla, ejecuta:
npx prisma migrate deploy
npm run seed
```

## 🐛 Solución de Problemas

### Error: "The table `public.users` does not exist"

Significa que las tablas no están creadas. Ejecuta:

```bash
npx prisma migrate deploy
npm run seed
```

### Error en VPS después de git pull

```bash
cd /var/www/nexo/nexo-api
git pull
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed  # opcional
pm2 restart nexo-api
```

## 📝 Notas

- El seed elimina productos y clientes existentes antes de crear los nuevos
- El usuario admin NO se elimina si ya existe (usa `upsert`)
- Las cantidades de stock son variadas para simular diferentes niveles de inventario
- Los precios son realistas para productos mexicanos (MXN)

## 🎯 Casos de uso

Este seed es útil para:

- ✅ Desarrollo local
- ✅ Pruebas de la UI
- ✅ Demos del sistema
- ✅ Testing de funcionalidades
- ❌ **NO usar en producción**
