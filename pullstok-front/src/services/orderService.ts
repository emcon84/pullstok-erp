import axios from 'axios';
import { CreateOrder, Order, UpdateOrder } from '../models/orderModel';
import { API_URL } from '../constants';

// Función para obtener las órdenes
export const getOrders = async (branchId?: string): Promise<Order[]> => {
  const token = localStorage.getItem('token');
  const url = new URL(`${API_URL}/orders`);
  if (branchId) {
    url.searchParams.set("branchId", branchId);
  }
  const response = await axios.get<Order[]>(url.toString(), {
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

// Conteo de pedidos pendientes (PENDING) de la organización actual.
export const getPendingOrdersCount = async (): Promise<{ count: number }> => {
  const token = localStorage.getItem('token');
  const response = await axios.get<{ count: number }>(
    `${API_URL}/orders/pending-count`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return response.data;
};
