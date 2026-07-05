import axios from "axios";
import { API_URL } from "../constants";

export interface BotConfig {
  enabled: boolean;
  knowledgeBase: string;
  model: string;
  dailyLimit: number;
}

// El body del PUT: enabled + knowledgeBase obligatorios; model/dailyLimit
// opcionales (el backend mantiene el valor previo si no viajan).
export type UpdateBotConfigInput = {
  enabled: boolean;
  knowledgeBase: string;
  model?: string;
  dailyLimit?: number;
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getBotConfig = async (): Promise<BotConfig> => {
  try {
    const response = await axios.get<BotConfig>(`${API_URL}/bot/config`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching bot config",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const updateBotConfig = async (
  data: UpdateBotConfigInput,
): Promise<BotConfig> => {
  try {
    const response = await axios.put<BotConfig>(`${API_URL}/bot/config`, data, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating bot config",
      );
    }
    throw new Error("An unknown error occurred");
  }
};
