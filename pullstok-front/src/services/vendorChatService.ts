import axios from "axios";
import { API_URL } from "@/constants";

export interface VendorChat {
  id: string;
  organizationId: string;
  sellerId: string;
  status: "ACTIVE" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  messages: VendorChatMessage[];
  _count?: { messages: number };
}

export interface VendorChatMessage {
  id: string;
  vendorChatId: string;
  organizationId: string;
  sender: "SELLER" | "ASSISTANT";
  isBot: boolean;
  body: string;
  ragContext: string | null;
  createdAt: string;
}

export interface CreateVendorChatDto {
  sellerId: string;
}

const token = () => localStorage.getItem("token");

export const vendorChatApiClient = {
  createConversation: async (data: CreateVendorChatDto): Promise<VendorChat> => {
    try {
      const res = await axios.post<VendorChat>(
        `${API_URL}/vendor-chat/conversations`,
        data,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || "create conversation failed");
      }
      throw new Error("An unknown error occurred");
    }
  },

  listConversations: async (): Promise<VendorChat[]> => {
    try {
      const res = await axios.get<VendorChat[]>(
        `${API_URL}/vendor-chat/conversations`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || "list conversations failed",
        );
      }
      throw new Error("An unknown error occurred");
    }
  },

  getConversation: async (id: string): Promise<VendorChat> => {
    try {
      const res = await axios.get<VendorChat>(
        `${API_URL}/vendor-chat/conversations/${id}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || "get conversation failed",
        );
      }
      throw new Error("An unknown error occurred");
    }
  },

  sendMessage: async (
    conversationId: string,
    sender: "SELLER" | "ASSISTANT",
    body: string,
  ): Promise<VendorChatMessage> => {
    try {
      const res = await axios.post<VendorChatMessage>(
        `${API_URL}/vendor-chat/messages`,
        { vendorChatId: conversationId, sender, body },
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || "send message failed",
        );
      }
      throw new Error("An unknown error occurred");
    }
  },

  closeConversation: async (id: string): Promise<void> => {
    try {
      await axios.post(
        `${API_URL}/vendor-chat/conversations/${id}/close`,
        {},
        { headers: { Authorization: `Bearer ${token()}` } },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || "close conversation failed",
        );
      }
      throw new Error("An unknown error occurred");
    }
  },
};

export default vendorChatApiClient;
