import axios from "axios";
import { API_URL } from "../constants";

export const uploadProductsCsv = async (file: File): Promise<void> => {
  const token = localStorage.getItem('token');

  const formData = new FormData();
  formData.append('file', file);

  await axios.post(`${API_URL}/products/upload-csv`, formData, {
      headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
      },
  });
};