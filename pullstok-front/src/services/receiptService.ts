import axios from "axios";
import { API_URL } from "../constants";
import { Receipt } from "../models/receiptModel";

export const createReceipt = async (data: {
  relatedDocument: string;
}): Promise<Receipt> => {
  const token = localStorage.getItem("token");
  const response = await axios.post(`${API_URL}/receipts`, data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getReceipts = async (): Promise<Receipt[]> => {
  const token = localStorage.getItem("token");
  const response = await axios.get(`${API_URL}/receipts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};
