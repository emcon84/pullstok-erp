import { ProductsProps } from "./productsModel";

export interface CartItem {
  product: ProductsProps;
  quantity: number;
  totalPrice: number;
  saleMode?: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO";
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
  orderId?: string;
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
  /** Presente cuando la venta se generó procesando un pedido (1:1 Order). */
  orderId?: string;
  /** Presente cuando el backend incluye el select de invoice (getAllSales WS3). */
  invoice?: { id: string } | null;
}
