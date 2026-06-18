import { ProductsProps } from "./productsModel";

export interface CartItem {
  product: ProductsProps;
  quantity: number;
  totalPrice: number;
}