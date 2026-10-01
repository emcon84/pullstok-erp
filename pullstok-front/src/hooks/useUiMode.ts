import { useOrgModulesContext } from "@/contexts/OrgModulesContext";
import type { UiMode } from "@/services/modulesService";

/**
 * Modo de interfaz de la organización (OPERATIVO | ADMINISTRATIVO).
 * Fuente: GET /api/modules (OrgModulesContext). Mientras esa query carga se
 * usa el `uiMode` que viajó en el login (localStorage "user") para no
 * parpadear entre layouts; sin ningún dato cae a OPERATIVO (comportamiento
 * histórico).
 */
export const useUiMode = (): UiMode => {
  const { uiMode } = useOrgModulesContext();
  if (uiMode) return uiMode;
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    const fromLogin = stored?.uiMode ?? stored?.organization?.uiMode;
    if (fromLogin === "ADMINISTRATIVO") return "ADMINISTRATIVO";
  } catch {
    // localStorage no disponible / JSON inválido → default
  }
  return "OPERATIVO";
};
