import { useQuery } from "@tanstack/react-query";
import { useBranches } from "@/components/hooks/useBranches";
import { useBrandingContext } from "@/contexts/BrandingContext";
import { getMe } from "@/services/onboardingService";
import { resolveTicketCompany, type TicketCompany } from "@/utils/saleTicket";
import ticketLogoUrl from "@/assets/LogoConCirculoNegro.svg";

/**
 * Encabezado del ticket térmico: logo/nombre del branding, CUIT/condición y
 * dirección/teléfono de la organización (cache de ["me"]). La sucursal
 * (dirección/teléfono propios) solo la puede listar ADMIN/MANAGEMENT
 * (GET /branches); para el resto queda deshabilitada y rige la organización.
 * Requiere QueryClientProvider y (opcional) BrandingProvider (ProtectedLayout).
 */
export function useTicketCompany(branchId: string | null | undefined): TicketCompany {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { branding } = useBrandingContext();
  const canListBranches = me?.role === "ADMIN" || me?.role === "MANAGEMENT";
  const { branches } = useBranches(canListBranches);
  return resolveTicketCompany({
    businessName: branding.displayName,
    // Logo negro empaquetado en la app: mismo origen (sin CORS) y oscuro sobre
    // transparente, que es lo que se ve en papel térmico. El logo de branding
    // está pensado para el tema oscuro y no se imprime bien.
    logoUrl: ticketLogoUrl,
    org: me?.organization,
    branch: branches.find((b) => b.id === branchId),
  });
}
