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
    if (data.token) {
      localStorage.setItem('token', data.token);
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
