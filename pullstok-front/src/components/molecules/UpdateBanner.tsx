import { useEffect } from "react";
import { toast } from "react-toastify";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAUpdate } from "@/hooks/usePWAUpdate";

/**
 * Banner global de actualización PWA.
 *
 * - Cuando hay una versión nueva desplegada (needRefresh), muestra un aviso
 *   fijo con botón "Actualizar ahora" que aplica el service worker nuevo y
 *   recarga la ventana sin cerrar la app.
 * - La primera vez que la app queda lista para funcionar offline, muestra
 *   un toast informativo.
 */
export const UpdateBanner = () => {
  const { needRefresh, offlineReady, applyUpdate, dismiss } = usePWAUpdate();

  useEffect(() => {
    if (offlineReady) {
      toast.info("La app ya funciona sin conexión.", {
        toastId: "offline-ready",
      });
    }
  }, [offlineReady]);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t bg-background p-3 shadow-lg sm:bottom-4 sm:inset-x-auto sm:right-4 sm:rounded-lg sm:border">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Hay una versión nueva disponible</p>
          <p className="text-xs text-muted-foreground">
            Actualizá para ver los últimos cambios.
          </p>
        </div>
        <Button size="sm" onClick={applyUpdate}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Actualizar
        </Button>
        <Button variant="ghost" size="icon" onClick={dismiss} title="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default UpdateBanner;
