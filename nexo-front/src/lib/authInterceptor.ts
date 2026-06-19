import axios from "axios";

/**
 * Interceptor GLOBAL de respuestas: ante un 401 (token vencido o inválido),
 * limpia la sesión y rebota al login. Evita que el usuario quede "tildado"
 * con un token vencido. Todos los services usan el axios por defecto, así que
 * este interceptor los cubre a todos.
 */
let redirecting = false;

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";

    // Un 401 en login/refresh = credenciales inválidas, NO rebotar.
    const isAuthCall =
      url.includes("/auth/login") || url.includes("/auth/refresh");

    if (status === 401 && !isAuthCall && !redirecting) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");

      // Solo redirigir si no estamos ya en el login (evita loops).
      if (window.location.pathname !== "/") {
        redirecting = true;
        window.location.href = "/";
      }
    }

    return Promise.reject(error);
  },
);
