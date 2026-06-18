import { Customer } from "./customerModel";

export interface Product {
  id?: string;
  _id?: string;
  name: string;
  price: number;
  description?: string;
  category: string;
  image?: string;
  quantity: number;
  __v?: number;
}

export interface OrderProduct {
  id?: string;
  _id?: string;
  product: Product | null;
  quantity: number;
  price: number;
}

export interface Order {
  id?: string;
  _id?: string;
  customer: Customer;
  products?: OrderProduct[];
  items?: OrderProduct[]; // Prisma devuelve 'items' en lugar de 'products'
  totalAmount: number;
  status: string;
  type: string;
  quotation?: string;
  createdAt: string;
  __v?: number;
  receipt?: string;
}

export interface CreateOrderProduct {
  product: string; // ID del producto
  quantity: number;
  price: number;
}

export interface CreateOrderDirectProduct {
  productId: string;
  quantity: number;
  price: number;
}

export interface CreateOrder {
  customer: string;
  type: string; // Tipo de orden, e.g., "sale"
  quotationId?: string; // desde presupuesto
  products?: CreateOrderDirectProduct[]; // pedido directo
  totalAmount?: number;
}
