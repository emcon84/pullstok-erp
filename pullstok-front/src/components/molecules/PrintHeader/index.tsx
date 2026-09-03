import type { ReactNode } from "react";
import defaultLogoUrl from "@/assets/LogoPullNegroHor.svg";
import { useBrandingContext } from "@/contexts/BrandingContext";

interface PrintHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

/**
 * Encabezado imprimible con el logo DEL NEGOCIO (branding.logoUrl del contexto).
 * Cada organización imprime con su propia marca. Si la org no subió un logo, se
 * usa el de Pullstok (variante horizontal en negro, apta para fondo blanco).
 * Se usa en todas las áreas imprimibles: listado de productos, planilla
 * mayorista, bulk price y planilla por kg.
 */
export const PrintHeader = ({ title, subtitle }: PrintHeaderProps) => {
  const { branding } = useBrandingContext();
  const logoUrl = branding.logoUrl ?? defaultLogoUrl;

  return (
    <div className="mb-4 flex items-center gap-3">
      <img
        src={logoUrl}
        alt="Logo"
        data-testid="print-logo"
        className="h-10 w-auto max-w-full object-contain"
      />
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="text-sm">{subtitle}</p>}
      </div>
    </div>
  );
};

export default PrintHeader;
