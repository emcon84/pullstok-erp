export interface ProductsProps {
  _id?: string;
  id?: string;
  name: string;
  price: number | string;
  image?: string;
  description?: string;
  categoryId?: string;
  category?: string;
  quantity: number | string;
}

export interface ProductID {
  _id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
  quantity: number;
  __v: number;
}

export interface Product {
  productId: ProductID;
  name: string;
  quantity: number;
  category: string;
  price: number;
  _id: string;
}
