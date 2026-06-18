import axios from "axios";
import { DataItem } from "../types";
import { API_URL } from "../constants";

export const products = async () => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.get(`${API_URL}/products`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "products failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};
export const createProduct = async (product: DataItem) => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.post(`${API_URL}/products`, product, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "create product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};

export const updateProduct = async (product: DataItem) => {
  try {
    const token = localStorage.getItem("token");
    const productId = product._id || product.id;

    const response = await axios.put(
      `${API_URL}/products/${productId}`,
      product,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "update product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    const token = localStorage.getItem("token");

    await axios.delete(`${API_URL}/products/${productId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "delete product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};
