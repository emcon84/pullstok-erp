import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImportAccountRow } from "../../services/accounts";

/** Vista previa de la importación GFLOW: presentacional, la confirmación la maneja el padre. */
interface Props {
  open: boolean;
  fileName: string;
  accounts: ImportAccountRow[];
  errors: string[];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const GflowImportDialog = ({
  open,
  fileName,
  accounts,
  errors,
  loading,
  onConfirm,
  onCancel,
}: Props) => {
  // Capítulos = cuentas de código de un solo dígito; el conteo cubre todo su subárbol.
  const chapters = useMemo(
    () =>
      accounts
        .filter((a) => a.parentCode === null)
        .map((c) => ({
          code: c.code,
          name: c.name,
          count: accounts.filter((a) => a.code.charAt(0) === c.code).length,
        })),
    [accounts],
  );
  const hasErrors = errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar plan de cuentas desde GFLOW</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 font-medium text-destructive">
            Esto reemplaza el plan de cuentas actual de la empresa.
          </div>

          <p>
            Se importarán <strong>{accounts.length}</strong> cuentas.
          </p>

          {chapters.length > 0 && (
            <ul className="divide-y rounded-md border">
              {chapters.map((c) => (
                <li key={c.code} className="flex justify-between px-3 py-1.5">
                  <span>
                    {c.code} · {c.name}
                  </span>
                  <span className="text-muted-foreground">{c.count}</span>
                </li>
              ))}
            </ul>
          )}

          {hasErrors && (
            <div role="alert" className="space-y-1">
              <p className="font-medium text-destructive">
                El archivo tiene {errors.length} error{errors.length === 1 ? "" : "es"}:
              </p>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-destructive">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={hasErrors || accounts.length === 0 || loading}
          >
            {loading ? "Importando..." : "Reemplazar e importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
