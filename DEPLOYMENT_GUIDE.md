# Guía de Deployment - Pulse en VPS Hostinger

Esta guía te ayudará a migrar tu aplicación Pulse (Frontend + API) a tu VPS en Hostinger.

## 📋 Prerequisitos

- Acceso SSH a tu VPS de Hostinger
- Dominio configurado (opcional, pero recomendado)
- Credenciales de MongoDB (local en el VPS o MongoDB Atlas)

## 🚀 Paso 1: Preparar el VPS

### 1.1 Conectar al VPS via SSH

```bash
ssh usuario@tu-ip-vps
# o
ssh usuario@tu-dominio.com
```

### 1.2 Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 Instalar Node.js (v18 o superior)

```bash
# Instalar Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node --version
npm --version
```

### 1.4 Instalar PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 1.5 Instalar Nginx

```bash
sudo apt install -y nginx
```

### 1.6 Instalar MongoDB (si quieres DB local) - OPCIONAL

```bash
# MongoDB Community Edition
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-archive-keyring.gpg

echo "deb [ signed-by=/usr/share/keyrings/mongodb-archive-keyring.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

# Iniciar MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Alternativa:** Puedes usar MongoDB Atlas (cloud) - más recomendado para producción.

### 1.7 Instalar Git

```bash
sudo apt install -y git
```

---

## 📦 Paso 2: Clonar y Configurar el Proyecto

### 2.1 Crear directorio para la aplicación

```bash
sudo mkdir -p /var/www
cd /var/www
```

### 2.2 Clonar tu repositorio (o subir archivos)

**Opción A: Con Git**

```bash
sudo git clone https://github.com/tu-usuario/nexo.git
cd nexo
```

**Opción B: Subir archivos manualmente**

```bash
# Desde tu máquina local, comprime tu proyecto
tar -czf nexo.tar.gz api/ nexo-front/

# Sube al VPS usando scp
scp nexo.tar.gz usuario@tu-ip-vps:/tmp/

# En el VPS, descomprime
cd /var/www
sudo tar -xzf /tmp/nexo.tar.gz
sudo mv nexo-* nexo  # Si el nombre es diferente
```

---

## ⚙️ Paso 3: Configurar la API

### 3.1 Instalar dependencias

```bash
cd /var/www/nexo/api
sudo npm install --production
```

### 3.2 Configurar variables de entorno

```bash
sudo nano .env
```

Agrega lo siguiente (ajusta con tus valores):

```env
MONGO_URI=mongodb://localhost:27017/nexo
# o si usas MongoDB Atlas:
# MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/nexo

JWT_SECRET=tu_secret_key_muy_segura_aqui_123456789

CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

PORT=5000
NODE_ENV=production
```

Guarda con `Ctrl + X`, luego `Y`, luego `Enter`.

### 3.3 Compilar el proyecto

```bash
sudo npm run build
```

### 3.4 Crear directorio de logs

```bash
sudo mkdir -p logs
```

### 3.5 Iniciar la API con PM2

```bash
sudo pm2 start ecosystem.config.js
sudo pm2 save
sudo pm2 startup
```

Esto ejecutará un comando que debes copiar y ejecutar para que PM2 se inicie automáticamente al reiniciar el servidor.

### 3.6 Verificar que la API está corriendo

```bash
sudo pm2 status
sudo pm2 logs nexo-api --lines 50
```

---

## 🎨 Paso 4: Configurar el Frontend

### 4.1 Configurar variable de entorno

```bash
cd /var/www/nexo/nexo-front
sudo nano .env
```

Agrega:

```env
VITE_API_URL=https://tu-dominio.com/api
# o si aún no tienes dominio:
# VITE_API_URL=http://tu-ip-vps/api
```

### 4.2 Instalar dependencias

```bash
sudo npm install
```

### 4.3 Compilar para producción

```bash
sudo npm run build
```

Esto creará una carpeta `dist` con los archivos optimizados.

### 4.4 Copiar archivos compilados a la carpeta de Nginx

```bash
sudo mkdir -p /var/www/nexo-front
sudo cp -r dist/* /var/www/nexo-front/
sudo chown -R www-data:www-data /var/www/nexo-front
```

---

## 🌐 Paso 5: Configurar Nginx

### 5.1 Crear archivo de configuración

```bash
sudo nano /etc/nginx/sites-available/nexo
```

Copia el contenido del archivo `nginx-config.conf` que creé en el proyecto y **reemplaza `tu-dominio.com` con tu dominio real o IP**.

### 5.2 Habilitar el sitio

```bash
sudo ln -s /etc/nginx/sites-available/nexo /etc/nginx/sites-enabled/
```

### 5.3 Eliminar configuración por defecto (opcional)

```bash
sudo rm /etc/nginx/sites-enabled/default
```

### 5.4 Probar la configuración

```bash
sudo nginx -t
```

Si todo está OK, verás:

```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 5.5 Reiniciar Nginx

```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 🔒 Paso 6: Configurar HTTPS con Let's Encrypt (OPCIONAL pero RECOMENDADO)

### 6.1 Instalar Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 6.2 Obtener certificado SSL

```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Sigue las instrucciones. Certbot configurará automáticamente Nginx para HTTPS.

### 6.3 Renovación automática

Certbot instalará un cronjob automático, pero puedes verificar:

```bash
sudo certbot renew --dry-run
```

---

## 🔥 Paso 7: Configurar Firewall

```bash
# Permitir OpenSSH
sudo ufw allow OpenSSH

# Permitir HTTP y HTTPS
sudo ufw allow 'Nginx Full'

# Habilitar firewall
sudo ufw enable

# Ver estado
sudo ufw status
```

---

## ✅ Paso 8: Actualizar CORS en la API

Ya tienes configurado el CORS en tu API, pero asegúrate de actualizar las URLs:

```javascript
// En api/src/app.ts
app.use(
  cors({
    origin: [
      "https://tu-dominio.com",
      "http://tu-dominio.com",
      "http://localhost:5173", // Para desarrollo local
    ],
  }),
);
```

Después de modificar:

```bash
cd /var/www/nexo/api
sudo npm run build
sudo pm2 restart nexo-api
```

---

## 🧪 Paso 9: Probar la Aplicación

1. Abre tu navegador
2. Ve a `http://tu-dominio.com` o `http://tu-ip-vps`
3. Deberías ver tu frontend de React
4. Prueba el login y otras funcionalidades

---

## 📊 Comandos Útiles

### PM2 (Gestión de la API)

```bash
sudo pm2 status              # Ver estado de procesos
sudo pm2 logs nexo-api       # Ver logs en tiempo real
sudo pm2 restart nexo-api    # Reiniciar la API
sudo pm2 stop nexo-api       # Detener la API
sudo pm2 delete nexo-api     # Eliminar del PM2
sudo pm2 monit               # Monitor interactivo
```

### Nginx

```bash
sudo nginx -t                     # Probar configuración
sudo systemctl restart nginx      # Reiniciar Nginx
sudo systemctl status nginx       # Ver estado
sudo tail -f /var/log/nginx/error.log  # Ver errores
```

### Logs

```bash
# API
sudo pm2 logs nexo-api

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🔄 Actualizar la Aplicación

### Actualizar la API

```bash
cd /var/www/nexo/api
sudo git pull  # Si usas Git
sudo npm install --production
sudo npm run build
sudo pm2 restart nexo-api
```

### Actualizar el Frontend

```bash
cd /var/www/nexo/nexo-front
sudo git pull  # Si usas Git
sudo npm install
sudo npm run build
sudo cp -r dist/* /var/www/nexo-front/
```

---

## 🐛 Troubleshooting

### La API no arranca

```bash
sudo pm2 logs nexo-api --lines 100
# Revisa las variables de entorno en .env
# Verifica que MongoDB esté corriendo: sudo systemctl status mongod
```

### Error 502 Bad Gateway

```bash
# Verifica que la API esté corriendo
sudo pm2 status

# Revisa logs de Nginx
sudo tail -f /var/log/nginx/error.log
```

### El frontend no carga la API

- Verifica la variable `VITE_API_URL` en el `.env` del frontend
- Verifica la configuración de CORS en `api/src/app.ts`
- Revisa la consola del navegador (F12) para ver errores

### Problemas de permisos

```bash
# Frontend
sudo chown -R www-data:www-data /var/www/nexo-front

# API logs
sudo chmod -R 755 /var/www/nexo/api/logs
```

---

## 📝 Checklist Final

- [ ] VPS actualizado y configurado
- [ ] Node.js, PM2, Nginx instalados
- [ ] MongoDB configurado (local o Atlas)
- [ ] API clonada y configurada con .env
- [ ] API compilada y corriendo con PM2
- [ ] Frontend compilado y copiado a /var/www/nexo-front
- [ ] Nginx configurado y corriendo
- [ ] CORS actualizado en la API
- [ ] Firewall configurado
- [ ] (Opcional) HTTPS con Let's Encrypt
- [ ] Aplicación funcionando correctamente

---

## 💡 Recomendaciones de Seguridad

1. **Cambia el puerto SSH por defecto** (22) a otro puerto
2. **Usa claves SSH** en lugar de contraseñas
3. **Configura fail2ban** para proteger contra ataques de fuerza bruta
4. **Mantén el sistema actualizado** regularmente
5. **Usa variables de entorno seguras** y nunca las subas a Git
6. **Habilita HTTPS** con Let's Encrypt
7. **Realiza backups** regulares de tu base de datos

---

## 🆘 Soporte

Si encuentras problemas durante el deployment, revisa:

- Logs de PM2: `sudo pm2 logs`
- Logs de Nginx: `/var/log/nginx/error.log`
- Estado de servicios: `sudo systemctl status nginx mongod`

---

¡Listo! Tu aplicación Pulse debería estar corriendo en tu VPS de Hostinger. 🎉
