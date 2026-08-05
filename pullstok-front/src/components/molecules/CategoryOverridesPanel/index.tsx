import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface CategoryOverridesPanelProps {
  nodes: { id: string; name: string }[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
}

/**
 * Panel lateral de overrides de porcentaje sobre las categorías ya
 * seleccionadas. Solo muestra los nodos que el usuario marcó en la selección;
 * cada uno tiene su propio % editable. Componente CONTROLADO: valores y
 * cambios viven en el padre vía `values` + `onChange(id, value)`.
 */
export const CategoryOverridesPanel = ({
  nodes,
  values,
  onChange,
}: CategoryOverridesPanelProps) => {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Categorías seleccionadas</p>
      {nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay categorías seleccionadas.
        </p>
      ) : (
        <ul className="space-y-2">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-2">
              <Label htmlFor={`cat-ov-${node.id}`} className="min-w-0 flex-1 truncate">
                {node.name}
              </Label>
              <Input
                id={`cat-ov-${node.id}`}
                type="number"
                step="0.5"
                min="-100"
                max="500"
                className="h-8 w-24"
                value={values[node.id] ?? ""}
                placeholder="%"
                aria-label={`Porcentaje ${node.name}`}
                onChange={(e) => onChange(node.id, e.target.value)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};