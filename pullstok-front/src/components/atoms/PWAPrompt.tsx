import { useRegisterSW } from "virtual:pwa-register/react";

export const PWAPrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        setInterval(() => r.update(), 30 * 60 * 1000);
      }
    },
    onRegisterError(error: Error) {
      console.log("SW registration error", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg animate-in slide-in-from-bottom-4">
        <p className="text-sm font-medium">Nueva versión disponible</p>
        <button
          className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30 transition-colors"
          onClick={() => updateServiceWorker(true)}
        >
          Actualizar
        </button>
      </div>
    </div>
  );
};
