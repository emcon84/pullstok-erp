// src/services/budgetService.ts
// src/services/budgetService.ts
import { API_URL } from '../constants';
import { Budget, CreateBudget } from '../models/budgetModel';
import axios from 'axios';



export const getBudgets = async (): Promise<Budget[]> => {
  const token = localStorage.getItem('token');
  const response = await axios.get<Budget[]>(`${API_URL}/quotations`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};


export const createBudget = async (budgetData: CreateBudget): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.post(`${API_URL}/quotations`, budgetData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateBudget = async (
  id: string,
  budgetData: CreateBudget,
): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.put(`${API_URL}/quotations/${id}`, budgetData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const deleteBudget = async (id: string): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.delete(`${API_URL}/quotations/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getBudgetById = async (id: string): Promise<Budget> => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API_URL}/quotations/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data; // Asegúrate de devolver los datos de la respuesta
};

export const createOrderFromBudget = async (budgetId: string): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.post(`${API_URL}/orders`, { budgetId }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};