import http from 'http';
import app from './app';
import { initSocket } from './realtime/socket';
import { startWhatsappReactivationScheduler } from './services/whatsappReactivation';

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

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
