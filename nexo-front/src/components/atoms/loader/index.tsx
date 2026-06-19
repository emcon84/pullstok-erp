import { Loader2 } from "lucide-react";

export const Loader = () => {
  return (
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">Cargando...</p>
    </div>
  );
};
