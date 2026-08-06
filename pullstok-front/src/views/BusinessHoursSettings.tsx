import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "../services/onboardingService";
import { useBusinessHours, useUpdateBusinessHours } from "../hooks/useBusinessHours";
import { BusinessHoursForm } from "../components/molecules/BusinessHoursForm";

/**
 * Vista de configuración del horario comercial (sdd/business-hours-access),
 * ADMIN-only (el endpoint /business-hours exige requireRole("ADMIN")).
 * Clon de StoreSettings/AppBranding: hook react-query + form presentacional.
 */
export const BusinessHoursSettings = () => {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { settings, loading } = useBusinessHours();
  const { updateSettings, loading: isSaving } = useUpdateBusinessHours();

  // Guard client-side: la ruta vive en ProtectedLayout pero la config es solo
  // ADMIN (server-side también la protege). Un no-ADMIN que pinte la URL
  // vuelve al dashboard en vez de ver un formulario que le va a fallar.
  if (me && me.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Horario comercial</h1>
        <p className="text-muted-foreground">
          Configurá en qué días y horarios los roles operativos pueden operar.
        </p>
      </div>

      <BusinessHoursForm
        settings={settings}
        loading={loading}
        saving={isSaving}
        onSave={updateSettings}
      />
    </div>
  );
};
