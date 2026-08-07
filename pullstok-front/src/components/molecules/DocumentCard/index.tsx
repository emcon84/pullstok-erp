import { ReactNode, useState } from "react";
import { Pencil, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExportButtons } from "../ExportButtons";
import { DocTable } from "../DocTable";

interface DocItem {
  quantity?: number;
  name?: string;
  price?: number;
}

interface DocumentCardProps {
  label: string;
  title: string;
  subtitle?: string;
  items: DocItem[];
  total: number;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onInvoice?: () => void;
  onCreateSale?: () => void;
  badge?: ReactNode;
}

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

export const DocumentCard = ({
  label,
  title,
  subtitle,
  items,
  total,
  onExportPDF,
  onExportExcel,
  onEdit,
  onDelete,
  onInvoice,
  onCreateSale,
  badge,
}: DocumentCardProps) => {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {badge}
          </div>
          <p className="font-semibold">{title}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCreateSale && (
            <Button variant="default" size="sm" onClick={onCreateSale}>
              <ShoppingCart className="h-4 w-4" />
              Crear venta
            </Button>
          )}
          {onInvoice && (
            <Button variant="outline" size="sm" onClick={onInvoice}>
              <Receipt className="h-4 w-4" />
              Facturar
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
          {(onExportPDF || onExportExcel) && (
            <ExportButtons
              onExportPDF={onExportPDF ?? (() => {})}
              onExportExcel={onExportExcel ?? (() => {})}
            />
          )}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <DocTable items={items} showUnitPrice />
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 border-t pt-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-bold tabular-nums">{money(total)}</span>
      </div>

      {onDelete && (
        <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Eliminar este {label.toLowerCase()}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. {title} se borrará
                definitivamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onDelete();
                  setShowDelete(false);
                }}
              >
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
};
