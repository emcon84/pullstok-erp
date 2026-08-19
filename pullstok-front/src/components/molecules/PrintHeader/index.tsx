import type { ReactNode } from "react";
import logoUrl from "@/assets/logo-vertical.png";

interface PrintHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

/**
 * Encabezado imprimible con el logo oficial de la empresa (logo-vertical.png,
 * (asset estático, siempre en negro pleno). Se usa en todas las áreas
 * imprimibles: listado de productos, planilla mayorista, bulk price y
 * planilla por kg.
 */
export const PrintHeader = ({ title, subtitle }: PrintHeaderProps) => (
  <div className="mb-4 flex items-center gap-3">
    <img
      src={logoUrl}
      alt="Logo"
      data-testid="print-logo"
      className="h-14 w-auto max-w-full object-contain"
    />
    <div>
      <h1 className="text-lg font-bold">{title}</h1>
      {subtitle && <p className="text-sm">{subtitle}</p>}
    </div>
  </div>
);

export default PrintHeader;
