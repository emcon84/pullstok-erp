# Guía de Deployment — Pullstok ERP (VPS)

Monorepo pnpm con tres workspaces: `api` (Express + Prisma 7 + PostgreSQL), `pullstok-front` (React + Vite SPA) y `pullstok-landing` (Astro estático). Deploy root en el VPS: `/var/www/pullstok`.

## Prerequisitos (instalar una sola vez en el VPS)

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x

# pnpm 10 (vía corepack, viene con node 20+)
sudo corepack enable
corepack prepare pnpm@10 --activate
pnpm --version   # 10.x

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install -y nginx

# PostgreSQL 17
sudo apt install -y postgresql-17

# Certbot
sudo apt install -y certbot python3-certbot-nginx

# Git
sudo apt install -y git
```

## Setup inicial (una sola vez)

### 1. Clonar el repo

```bash
sudo mkdir -p /var/www
sudo git clone https://github.com/emcon84/pullstok-erp.git /var/www/pullstok
sudo chown -R "$USER":"$USER" /var/www/pullstok
cd /var/www/pullstok
```

### 2. Crear la base de datos y el usuario

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE pullstok;
CREATE USER pullstok_user WITH ENCRYPTED PASSWORD 'elegí-una-password-segura';
GRANT ALL PRIVILEGES ON DATABASE pullstok TO pullstok_user;

-- PostgreSQL 17 revoca privilegios por default sobre el schema "public".
-- Sin esto, Prisma falla al crear tablas con "permission denied for schema public".
\c pullstok
ALTER SCHEMA public OWNER TO pullstok_user;
GRANT ALL ON SCHEMA public TO pullstok_user;
\q
```

### 3. Variables de entorno

**`api/.env`**:

```env
DATABASE_URL="postgresql://pullstok_user:elegí-una-password-segura@localhost:5432/pullstok"
JWT_SECRET="secreto-largo-y-random"
PORT=5000
NODE_ENV=production

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Overrides de seed (ver paso 7) — evitan dejar el superadmin default en prod
SEED_SUPERADMIN_EMAIL=tu-email-real@dominio.com
SEED_SUPERADMIN_PASSWORD=otra-password-segura-y-distinta
```

**`pullstok-front/.env`** (se hornea en build time, Vite lo inyecta como string literal):

```env
VITE_API_URL=https://app.pullstok.com/api
```

### 4. Instalar dependencias (monorepo completo)

```bash
cd /var/www/pullstok
pnpm install --frozen-lockfile
```

### 5. Generar Prisma Client y compilar

```bash
pnpm --filter ./api exec prisma generate
pnpm -r build
```

Esto produce:
- `api/dist/bundle.js` (esbuild bundle único)
- `pullstok-front/dist/` (estáticos Vite)
- `pullstok-landing/dist/` (estáticos Astro)

### 6. Migraciones

```bash
cd /var/www/pullstok/api
set -a; . ./.env; set +a
pnpm exec prisma migrate deploy
```

### 7. Seed (manual, una sola vez)

**Importante:** sin los overrides `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` en `api/.env`, el seed crea el superadmin con credenciales públicas hardcodeadas en el repo (`superadmin@nexo.com` / `superadmin123`) — verdadero riesgo de seguridad en un repo público. Definí esas dos variables en `api/.env` ANTES de seedear.

```bash
cd /var/www/pullstok/api
set -a; . ./.env; set +a
pnpm exec ts-node prisma/seed.ts
```

### 8. Arrancar la API con PM2

```bash
cd /var/www/pullstok/api
set -a; . ./.env; set +a
pm2 start dist/bundle.js --name pullstok-api
pm2 save
pm2 startup   # copiar y correr el comando que imprime, para que PM2 sobreviva reboots
```

### 9. Nginx (dos vhosts)

Copiá `nginx-config.conf` (en la raíz del repo) a `/etc/nginx/sites-available/pullstok` — ya tiene los dos server blocks (landing en `pullstok.com`/`www.pullstok.com`, app+API en `app.pullstok.com`).

```bash
sudo cp /var/www/pullstok/nginx-config.conf /etc/nginx/sites-available/pullstok
sudo ln -s /etc/nginx/sites-available/pullstok /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 10. HTTPS con certbot

```bash
sudo certbot --nginx -d pullstok.com -d www.pullstok.com -d app.pullstok.com
```

Certbot agrega los bloques `listen 443 ssl`, instala los certificados y convierte los bloques `listen 80` en redirects HTTP→HTTPS. Verificá la renovación automática:

```bash
sudo certbot renew --dry-run
```

## Redeploy (cambios posteriores)

Todo el flujo de arriba (pull, install, generate, build, migrate, restart PM2, reload nginx) está automatizado en `deploy.sh`:

```bash
cd /var/www/pullstok
./deploy.sh
```

El script es idempotente — seguro de re-correr. **No** corre el seed (es un paso manual, ver punto 7) y **nunca** toca `api/uploads/` (ahí vive el contenido subido por los usuarios; no se borra ni se sobreescribe en un redeploy).

## Backups

`backup.sh` hace un `pg_dump` de la base `pullstok` en formato custom (`-Fc`, restaurable con `pg_restore`) y purga backups con más de 7 días. Pensado para correr por cron como root:

```bash
sudo crontab -e
# 0 2 * * * /var/www/pullstok/backup.sh >> /var/log/pullstok-backup.log 2>&1
```

## Comandos útiles

```bash
# PM2
pm2 status
pm2 logs pullstok-api
pm2 restart pullstok-api --update-env

# Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log

# Postgres
sudo -u postgres psql -d pullstok
```

## Troubleshooting

**La API no arranca:** `pm2 logs pullstok-api --lines 100`. Revisar que `api/.env` tenga `DATABASE_URL` correcto y que postgres esté arriba (`sudo systemctl status postgresql`).

**502 Bad Gateway:** la API no está escuchando en el puerto 5000, o no matchea con el `proxy_pass` de nginx. Chequear `pm2 status` y que `PORT=5000` en `api/.env`.

**El front no le pega a la API:** `VITE_API_URL` se hornea en build time — si lo cambiás, hay que volver a correr `pnpm --filter ./pullstok-front build` (o `pnpm -r build`), no alcanza con reiniciar nginx.

**Error de permisos en schema `public` al migrar:** ver el paso 2 (`ALTER SCHEMA public OWNER TO pullstok_user`) — PostgreSQL 17 cambió los privilegios default sobre `public`.
