import axios from 'axios';
import { API_URL } from '../constants';


export const login = async (email: string, password: string) => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || 'Login failed');
    } else {
      // Error general
      throw new Error('An unknown error occurred');
    }
  }
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  try {
    const token = localStorage.getItem('token');
    await axios.post(
      `${API_URL}/auth/change-password`,
      { currentPassword, newPassword },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Change password failed');
    } else {
      throw new Error('An unknown error occurred');
    }
  }
};

export const forgotPassword = async (email: string): Promise<string> => {
  try {
    const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
    return response.data.message;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(error.response?.data?.message || 'Demasiados intentos. Esperá 15 minutos.');
      }
      if (error.response?.status === 403) {
        throw new Error(error.response?.data?.message || 'Contactá a tu administrador.');
      }
      throw new Error(error.response?.data?.message || 'Error al solicitar recuperación');
    } else {
      throw new Error('Error desconocido');
    }
  }
};

export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<string> => {
  try {
    const response = await axios.post(`${API_URL}/auth/reset-password`, {
      token,
      newPassword,
    });
    return response.data.message;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || 'Error al restablecer la contraseña',
      );
    } else {
      throw new Error('Error desconocido');
    }
  }
};
