import { useEffect, useState } from "react";
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
  const [activeWaiting, setActiveWaiting] = useState(false);

  // Verificación activa: si el SW nuevo ya quedó "waiting" antes de que este
  // componente se monte (típico tras un deploy con la app abierta), el evento
  // de useRegisterSW no se dispara. Chequeamos la registration directamente
  // y escuchamos updatefound para los SW que lleguen después.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkWaiting = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        setActiveWaiting(!!registration?.waiting);
      } catch {
        setActiveWaiting(false);
      }
    };

    const onUpdateFound = () => {
      setActiveWaiting(true);
      setDismissed(false);
    };

    checkWaiting();

    // Escuchar cambios de registration: un updatefound significa que un SW
    // nuevo está instalándose; al terminar quedará en waiting.
    const watchRegistration = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.addEventListener("updatefound", onUpdateFound);
    };
    watchRegistration();

    const interval = setInterval(checkWaiting, 60000);

    return () => {
      clearInterval(interval);
      navigator.serviceWorker
        .getRegistration()
        .then((registration) =>
          registration?.removeEventListener("updatefound", onUpdateFound),
        )
        .catch(() => {});
    };
  }, []);

  const applyUpdate = async () => {
    setDismissed(false);
    await updateServiceWorker(true);
  };

  const dismiss = () => setDismissed(true);

  return {
    needRefresh: (needRefresh[0] || activeWaiting) && !dismissed,
    offlineReady: offlineReady[0],
    applyUpdate,
    dismiss,
  };
}
