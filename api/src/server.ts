import http from 'http';
import app from './app';
import { initSocket } from './realtime/socket';
import { startWhatsappReactivationScheduler } from './services/whatsappReactivation';
import { invalidateCatalogCache, TTL_MS } from './services/whatsappCatalogCache';

const PORT = process.env.PORT || 5000;

// Envolvemos el app de Express en un http server propio para poder attachear
// socket.io al MISMO server (mismo host/puerto que la API). El .listen se hace
// sobre el http server, no sobre el app.
const httpServer = http.createServer(app);
initSocket(httpServer);

// Job de inactividad: re-activa el bot en chats de WhatsApp escalados a HUMANO y
// sin atender (corre sin contexto de org → usa basePrisma con where explícito).
// Habilitado por default; KAPSO_REACTIVATE_ENABLED="false" lo apaga (para tests).
if (process.env.KAPSO_REACTIVATE_ENABLED !== "false") {
  startWhatsappReactivationScheduler();
}

// Refresco del snapshot del catálogo: el TTL se maneja en el getter (re-carga
// lazy al expirar: getCatalogSnapshot recarga cuando el cache quedó viejo).
// Este job solo INVALIDA el cache cada KAPSO_CATALOG_TTL_MS para asegurar que
// el próximo acceso recargue en frío — patrón invalida + lazy reload, más simple
// y robusto que recargar en el intervalo (un fallo de DB no crashea el server:
// invalidate nunca lanza y getCatalogSnapshot reutiliza el snapshot previo).
// Habilitado por default; KAPSO_CATALOG_REFRESH_ENABLED="false" lo apaga (tests).
// El loader del snapshot corre sin contexto de org → basePrisma con where
// explícito por la org de KAPSO_ORG_SLUG (ver whatsappCatalogCache.ts).
if (process.env.KAPSO_CATALOG_REFRESH_ENABLED !== "false") {
  setInterval(() => {
    try {
      invalidateCatalogCache();
    } catch (err) {
      console.error("[whatsappCatalogCache] invalidación del catálogo falló", err);
    }
  }, TTL_MS);
}

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
