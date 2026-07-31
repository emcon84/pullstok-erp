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

  // Verificación activa: el navegador NO avisa solo cuando hay un deploy —
  // solo chequea el SW al cargar la página, con registration.update(), o
  // cada ~24h. Para que la PWA abierta detecte versiones nuevas en tiempo
  // real, forzamos registration.update() periódicamente: descarga el sw.js,
  // lo compara, y si cambió dispara "updatefound" → banner.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registrationRef: ServiceWorkerRegistration | null | undefined = null;
    let disposed = false;

    const checkWaiting = async () => {
      try {
        const registration =
          registrationRef ??
          (await navigator.serviceWorker.getRegistration());
        registrationRef = registration;
        if (!registration) return;
        setActiveWaiting(!!registration.waiting);
        // Forzar la descarga/comparación del sw.js — el corazón de la
        // detección reactiva. No falla si no hay cambios (update() es no-op).
        await registration.update();
      } catch {
        setActiveWaiting(false);
      }
    };

    const onUpdateFound = () => {
      setActiveWaiting(true);
      setDismissed(false);
    };

    const watchRegistration = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      registrationRef = registration;
      registration?.addEventListener("updatefound", onUpdateFound);
    };
    watchRegistration();

    // Primer chequeo inmediato + polling cada 60s.
    checkWaiting();
    const interval = setInterval(() => {
      if (!disposed) checkWaiting();
    }, 60000);

    // Además del polling, escuchar el evento global "online": al volver la
    // conexión, el SW puede haber quedado desactualizado mientras estuvimos
    // offline.
    window.addEventListener("online", checkWaiting);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("online", checkWaiting);
      registrationRef?.removeEventListener("updatefound", onUpdateFound);
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
