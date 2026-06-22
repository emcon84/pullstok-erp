// src/models/Budget.ts
export interface Customer {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  phone: string;
  __v?: number;
}

export interface Product {
  id?: string;
  _id?: string;
  name: string;
  price: number;
  description?: string;
  category: string;
  image?: string;
  quantity: number;
}

export interface BudgetProduct {
  product: Product;
  quantity: number;
  price: number;
}

export interface Budget {
  id?: string;
  _id?: string;
  customer: Customer;
  products?: BudgetProduct[];
  items?: BudgetProduct[]; // Prisma devuelve 'items' en lugar de 'products'
  totalAmount: number;
  validUntil: string;
  createdAt: string;
  receipt?: string;
}

// src/models/Budget.ts
export interface CreateBudgetProduct {
  product: string; // ID del producto
  quantity: number;
  price: number;
}

export interface CreateBudget {
  customer: string; // ID del cliente
  products: CreateBudgetProduct[];
  totalAmount: number;
  validUntil: string;
}
