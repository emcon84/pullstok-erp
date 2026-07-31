import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

interface RefreshDataButtonProps {
  className?: string;
  title?: string;
}

/**
 * Botón de refresco manual de datos. Invalida todas las queries de
 * react-query para que los productos/precios se recarguen desde la API
 * sin recargar la ventana de la PWA.
 */
export const RefreshDataButton = ({
  className,
  title = "Actualizar datos",
}: RefreshDataButtonProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await queryClient.invalidateQueries();
      toast.success("Datos actualizados", { toastId: "data-refreshed" });
    } catch {
      toast.error("No se pudieron actualizar los datos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={handleRefresh}
      title={title}
      disabled={loading}
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </Button>
  );
};

export default RefreshDataButton;
