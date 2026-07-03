import http from 'http';
import app from './app';
import { initSocket } from './realtime/socket';

const PORT = process.env.PORT || 5000;

// Envolvemos el app de Express en un http server propio para poder attachear
// socket.io al MISMO server (mismo host/puerto que la API). El .listen se hace
// sobre el http server, no sobre el app.
const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
