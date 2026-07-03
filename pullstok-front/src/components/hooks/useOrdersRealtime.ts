import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "../../constants";

/**
 * Conexión WebSocket para tiempo real de pedidos.
 *
 * El server socket.io vive en el ROOT del mismo host/puerto que la API (path
 * default `/socket.io/`), NO bajo `/api`. Por eso derivamos el ORIGIN quitando
 * el sufijo `/api` de API_URL (ej. "http://localhost:5000/api" -> "http://localhost:5000").
 *
 * El socket manda solo una SEÑAL (`orders:changed`, sin payload). Ante ella
 * invalidamos la query `['orders']` por prefijo, lo que refetchea tanto la
 * lista como `['orders','pending-count']` (badge de la sidebar). No recibimos
 * datos por el socket.
 *
 * Se monta UNA vez en el árbol autenticado (ProtectedLayout) para que la
 * conexión viva toda la sesión y no se recree por navegación. socket.io maneja
 * la reconexión solo; el cleanup del useEffect desconecta al desmontar o al
 * cerrar sesión (y evita conexiones duplicadas por el doble-mount de StrictMode).
 */
const SOCKET_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export const useOrdersRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket: Socket = io(SOCKET_ORIGIN, {
      auth: { token },
    });

    socket.on("orders:changed", () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    });

    return () => {
      socket.off("orders:changed");
      socket.disconnect();
    };
  }, [queryClient]);
};
