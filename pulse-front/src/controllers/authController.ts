import axios from 'axios';
import { login as loginService } from '../services/authService';
import { API_URL } from '../constants';


// Crea una instancia de Axios
const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {      
      logout(); 
      window.location.href = '/'; 
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

export const logout = () => {
  try {
    localStorage.removeItem('token');
    window.location.href = '/'; 
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
