import axios from "axios";
import { toast } from "react-toastify";
import { clearSession } from "../controllers/authController";

/**
 * Interceptor GLOBAL de respuestas: ante un 401 (token vencido o inválido),
 * limpia la sesión y rebota al login. Evita que el usuario quede "tildado"
 * con un token vencido. Todos los services usan el axios por defecto, así que
 * este interceptor los cubre a todos.
 */
let redirecting = false;

const PLAN_LIMIT_RESOURCE_LABEL: Record<string, string> = {
  users: "usuarios",
  products: "productos",
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    const data = error?.response?.data;

    // Un 401 en login/refresh = credenciales inválidas, NO rebotar.
    const isAuthCall =
      url.includes("/auth/login") || url.includes("/auth/refresh");

    if (status === 401 && !isAuthCall && !redirecting) {
      clearSession();

      // Solo redirigir si no estamos ya en el login (evita loops).
      if (window.location.pathname !== "/") {
        redirecting = true;
        window.location.href = "/";
      }
    }

    // 403 OUTSIDE_BUSINESS_HOURS (sdd/business-hours-access): un rol operativo
    // con sesión viva golpeó una ruta fuera del horario comercial. Limpiamos
    // la sesión y vamos a la pantalla pública de bloqueo. Guard loop: si ya
    // estamos en /fuera-de-horario no volvemos a redirigir (evita ciclos).
    if (status === 403 && data?.error === "OUTSIDE_BUSINESS_HOURS") {
      clearSession();
      if (
        window.location.pathname !== "/fuera-de-horario" &&
        !redirecting
      ) {
        redirecting = true;
        window.location.href = "/fuera-de-horario";
      }
    }

    // 403 PLAN_LIMIT (sdd/planes-y-billing): el backend devuelve
    // { error: "PLAN_LIMIT", resource, limit, current } al crear usuarios o
    // productos por encima del tope del plan. Se intercepta acá (en vez de
    // en cada service) porque varios services envuelven la respuesta en un
    // `Error(message)` genérico y pierden el body estructurado — el
    // interceptor es el único punto que ve la respuesta cruda de axios.
    if (status === 403 && data?.error === "PLAN_LIMIT") {
      const label = PLAN_LIMIT_RESOURCE_LABEL[data.resource] ?? data.resource;
      toast.error(
        `Llegaste al límite de tu plan (${data.current} de ${data.limit} ${label}). Mejorá tu plan para seguir.`,
      );
    }

    return Promise.reject(error);
  },
);
