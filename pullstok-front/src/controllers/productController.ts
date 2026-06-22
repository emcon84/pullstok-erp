import { createProduct, products, updateProduct } from '../services/productService';
import { DataItem } from '../types';


export const productsList = async () => {
  try {
    const response = await products();
    return response;
  } catch (error) {
    console.error(error);
  }
}

export const addProduct = async (product: DataItem) => {
  try {
    const response = await createProduct(product);
    return response;
  } catch (error) {
    console.error(error);
    throw error; 
  }
};

export const saveProduct = async (product: DataItem) => {
  try {
    if (product._id) {
      return await updateProduct(product);
    } else {
      return await createProduct(product);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
};