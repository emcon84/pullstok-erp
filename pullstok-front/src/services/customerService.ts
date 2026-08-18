import axios from "axios";
import { CreateCustomer, Customer } from "../models/customerModel";
import { API_URL } from "../constants";

export interface PadronImpuesto {
  id: number;
  descripcion: string;
  estado: string;
}

export interface PadronDomicilio {
  direccion: string;
  localidad: string;
  codPostal: string;
  provincia: string;
}

export interface PadronPersona {
  cuit: string;
  razonSocial: string;
  estado: string;
  impuestos: PadronImpuesto[];
  domicilio: PadronDomicilio | null;
  constanciaUrl: string | null;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }
  return fallback;
};

/** Consulta el padrón A4 de un CUIT para autocompletar la carga de clientes.
 * El caller NO bloquea la carga manual si falla (CUIT inexistente → 404). */
export const fetchPadron = async (cuit: string): Promise<PadronPersona> => {
  try {
    const response = await axios.get<PadronPersona>(
      `${API_URL}/arca/padron/${cuit}`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al consultar el padrón de ARCA"));
  }
};

export const getCustomers = async (): Promise<Customer[]> => {
  const token = localStorage.getItem("token"); // Obtén el token de autenticación

  try {
    const response = await axios.get<Customer[]>(`${API_URL}/customers`, {
      headers: {
        Authorization: `Bearer ${token}`, // Añade el token de autorización a las cabeceras
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching customers",
      );
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

export const createCustomer = async (
  customerData: CreateCustomer,
): Promise<Customer> => {
  const token = localStorage.getItem("token"); // Obtén el token de autenticación

  try {
    const response = await axios.post<Customer>(
      `${API_URL}/customers`,
      customerData,
      {
        headers: {
          Authorization: `Bearer ${token}`, // Añade el token de autorización a las cabeceras
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating customer",
      );
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

// Actualizar un cliente por ID
export const updateCustomer = async (customer: Customer) => {
  try {
    const token = localStorage.getItem("token");
    const customerId = customer.id || customer._id;

    const response = await axios.put(
      `${API_URL}/customers/${customerId}`,
      customer,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Update customer failed",
      );
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

// Eliminar un cliente por ID
export const deleteCustomer = async (id: string) => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.delete(`${API_URL}/customers/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Delete customer failed",
      );
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};
