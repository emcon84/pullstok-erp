import { useEffect } from "react";
import { getSocket } from "../../lib/socket";
import {
  fetchAndPatchProduct,
  removeProductFromCatalog,
} from "../../lib/offlineCatalog";

/** Payload del evento socket `product:changed` (T1/T2, backend). */
interface ProductChangedEvent {
  productId: string;
  action: "created" | "updated" | "deleted";
}

/**
 * Tiempo real del catálogo offline sobre el socket COMPARTIDO
 * (`lib/socket.ts`). Ya no hace falta esperar al próximo `syncOfflineCatalog`
 * completo (TTL de 3min, ver `offlineCatalog.ts`) para que el scanner offline
 * refleje un producto creado/editado/borrado en OTRA sesión: ante
 * `product:changed` parcheamos SOLO ese producto.
 *
 * - `action === "deleted"` -> `removeProductFromCatalog(productId)`.
 * - `action === "created" | "updated"` -> `fetchAndPatchProduct(productId)`
 *   (fire-and-forget: no bloquea el handler del socket ni deja una promise
 *   rechazada suelta; `fetchAndPatchProduct` ya es defensivo internamente,
 *   pero igual atrapamos acá por las dudas).
 *
 * Se monta UNA vez en el árbol autenticado (ProtectedLayout), igual que
 * `useOrdersRealtime`/`useChatConversationsRealtime`: así el catálogo offline
 * se mantiene al día sin importar qué vista esté abierta (scanner, stock
 * suelto, etc.). El cleanup solo desregistra ESTE listener; no desconecta el
 * socket compartido.
 */
export const useProductCatalogRealtime = () => {
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    const handleProductChanged = (evt: ProductChangedEvent) => {
      if (evt.action === "deleted") {
        void removeProductFromCatalog(evt.productId).catch(() => {});
      } else {
        void fetchAndPatchProduct(evt.productId).catch(() => {});
      }
    };

    socket.on("product:changed", handleProductChanged);

    return () => {
      socket.off("product:changed", handleProductChanged);
    };
  }, []);
};
