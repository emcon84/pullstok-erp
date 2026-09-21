import { startTransition, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TransitionSearchInputProps {
  /** Valor con el que arranca. Para cambiarlo desde afuera, remontar con `key`. */
  initialValue: string;
  placeholder?: string;
  /** Se llama con cada valor nuevo, dentro de una transición (baja prioridad). */
  onValueChange: (value: string) => void;
}

/**
 * Buscador con estado LOCAL: cada tecla solo re-renderiza este componente
 * (el input pinta al instante) y el padre se entera vía startTransition, así
 * el filtrado/re-render pesado de la pantalla es interrumpible por la
 * siguiente tecla. Sin esto, con el estado en el padre, cada tecla
 * re-renderiza toda la vista antes de pintar y en mobile se siente el delay.
 */
export const TransitionSearchInput = ({
  initialValue,
  placeholder,
  onValueChange,
}: TransitionSearchInputProps) => {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          startTransition(() => onValueChange(next));
        }}
      />
    </div>
  );
};
