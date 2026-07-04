import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";

/**
 * Tiempo real de pedidos sobre el socket COMPARTIDO (`lib/socket.ts`). Ya no
 * abre su propia conexión: usa `getSocket(token)`, la misma instancia que
 * consume el chat. Así hay una sola conexión por operador que multiplexa
 * pedidos + chat.
 *
 * El socket manda solo una SEÑAL (`orders:changed`, sin payload). Ante ella
 * invalidamos la query `['orders']` por prefijo, lo que refetchea tanto la
 * lista como `['orders','pending-count']` (badge de la sidebar).
 *
 * Se monta UNA vez en el árbol autenticado (ProtectedLayout). El cleanup solo
 * desregistra ESTE listener (`socket.off('orders:changed')`); NO desconecta el
 * socket compartido (de eso se encarga el logout vía `disconnectSocket`), para
 * no cortarle la conexión al chat.
 */
export const useOrdersRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    const handleOrdersChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    };

    socket.on("orders:changed", handleOrdersChanged);

    return () => {
      socket.off("orders:changed", handleOrdersChanged);
    };
  }, [queryClient]);
};
