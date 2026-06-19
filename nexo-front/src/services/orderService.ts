import axios from 'axios';
import { CreateOrder, Order, UpdateOrder } from '../models/orderModel';
import { API_URL } from '../constants';

// Función para obtener las órdenes
export const getOrders = async (): Promise<Order[]> => {
  const token = localStorage.getItem('token');
  const response = await axios.get<Order[]>(`${API_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

// Función para crear una nueva orden
export const createOrder = async (newOrder: CreateOrder): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.post(`${API_URL}/orders`, newOrder, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateOrder = async (
  id: string,
  data: UpdateOrder,
): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.put(`${API_URL}/orders/${id}`, data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const deleteOrder = async (id: string): Promise<void> => {
  const token = localStorage.getItem('token');
  await axios.delete(`${API_URL}/orders/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
