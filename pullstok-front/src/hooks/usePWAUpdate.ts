import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Detecta cuando hay una versión nueva de la app desplegada y permite
 * actualizarla sin cerrar la PWA. Con registerType "prompt", el service
 * worker nuevo queda en estado "waiting" hasta que el usuario confirma.
 *
 * applyUpdate() envía el mensaje SKIP_WAITING; el plugin recarga la
 * ventana automáticamente cuando el SW nuevo toma el control.
 */
export function usePWAUpdate() {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {},
    onOfflineReady() {},
  });

  const [dismissed, setDismissed] = useState(false);

  const applyUpdate = async () => {
    setDismissed(false);
    await updateServiceWorker(true);
  };

  const dismiss = () => setDismissed(true);

  return {
    needRefresh: needRefresh[0] && !dismissed,
    offlineReady: offlineReady[0],
    applyUpdate,
    dismiss,
  };
}
