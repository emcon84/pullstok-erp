import axios from 'axios';
import { login as loginService } from '../services/authService';
import { API_URL } from '../constants';
import { disconnectSocket } from '../lib/socket';


// Crea una instancia de Axios
const api = axios.create({
  baseURL: API_URL,
});

// Limpia la sesión local (token, refresh, user) y cierra el socket compartido.
// Separado de logout() para que los interceptors puedan limpiar sin redirigir
// en loops (p.ej. si ya estamos en la ruta destino).
export const clearSession = () => {
  try {
    disconnectSocket();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  } catch (error) {
    console.error(error);
  }
};

/**
 * Cierra la sesión y redirige. `redirectTo` permite reusar el mismo flujo para
 * el 401 clásico ("/") y para OUTSIDE_BUSINESS_HOURS ("/fuera-de-horario").
 * Guard loop: si ya estamos en la ruta destino no se vuelve a redirigir.
 */
export const logout = (redirectTo = '/') => {
  clearSession();
  if (window.location.pathname !== redirectTo) {
    window.location.href = redirectTo;
  }
  return true;
};

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    // 401 → token inválido/vencido: logout clásico al login.
    if (status === 401) {
      logout('/');
    }
    // 403 OUTSIDE_BUSINESS_HOURS (sdd/business-hours-access): un rol operativo
    // intentó operar fuera del horario comercial → limpiar sesión + pantalla
    // de bloqueo público (fuera del sidebar).
    if (status === 403 && data?.error === 'OUTSIDE_BUSINESS_HOURS') {
      logout('/fuera-de-horario');
    }
    return Promise.reject(error);
  }
);

export const login = async (email: string, password: string) => {
  try {
    const data = await loginService(email, password);
    // El backend (Fase 1+) devuelve { accessToken, refreshToken, user }.
    if (data.accessToken) {
      localStorage.setItem('token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      return true;
    }
    return false;
  } catch (error) {
    console.error(error);
    return false;
  }
};
