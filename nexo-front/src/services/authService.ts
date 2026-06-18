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
