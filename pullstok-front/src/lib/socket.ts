import { io, type Socket } from "socket.io-client";
import { API_URL } from "../constants";

/**
 * Socket.io singleton compartido para TODO el tiempo real del ERP (pedidos,
 * chat y, a futuro, el bot). Antes cada feature abría su propia conexión
 * `io()`; eso implicaba dos (o más) sockets por operador, feo y caro. Ahora
 * hay UNA sola conexión que multiplexa todos los eventos por sus rooms.
 *
 * El server socket.io vive en el ROOT del mismo host/puerto que la API (path
 * default `/socket.io/`), NO bajo `/api`. Por eso derivamos el ORIGIN quitando
 * el sufijo `/api` de API_URL (ej. "http://localhost:5000/api" ->
 * "http://localhost:5000").
 *
 * `getSocket(token)` memoiza la instancia por token: mientras el token no
 * cambie, siempre devuelve la MISMA conexión. Si cambia el token (login como
 * otro usuario) se descarta la anterior y se crea una nueva. socket.io maneja
 * la reconexión solo.
 */
const SOCKET_ORIGIN = API_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string): Socket {
  if (socket && socketToken === token) {
    return socket;
  }
  // Token distinto (o primera vez): descartamos la conexión previa si existía.
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(SOCKET_ORIGIN, { auth: { token } });
  socketToken = token;
  return socket;
}

/**
 * Cierra y descarta la conexión compartida. Llamar al hacer logout para no
 * dejar un socket colgado autenticado con un token que ya no vale.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
}
