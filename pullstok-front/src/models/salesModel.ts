import { ProductsProps } from "./productsModel";

export interface CartItem {
  product: ProductsProps;
  quantity: number;
  totalPrice: number;
}

export interface SaleRequest {
  products: {
    productId: string;
    quantity: string;
    name: string;
    price: string;
    description: string;
    category: string;
  }[];
}

export interface Sale {
  id?: string;
  _id?: string;
  items?: {
    id?: string;
    _id?: string;
    name: string;
    quantity: number;
    price: number;
    category: string;
    productId: string;
  }[];
  products?: {
    id?: string;
    _id?: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  saleDate: string;
  createdAt?: string;
  __v?: number;
}
