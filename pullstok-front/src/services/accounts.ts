import axios from "axios";
import { API_URL } from "../constants";

/** Cliente API del plan de cuentas (módulo "contabilidad"). */

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  shortCode?: string | null;
  name: string;
  type: AccountType;
  parentId: string | null;
  /** Imputable: solo las cuentas hoja reciben asientos. */
  isPostable: boolean;
  isActive: boolean;
  /** Saldo normal (importado de GFLOW); null si no se informó. */
  normalBalance?: "DEBIT" | "CREDIT" | null;
}

/** Payload de alta/edición. En edición, shortCode "" lo limpia y parentId null la vuelve raíz. */
export interface AccountInput {
  code?: string;
  shortCode?: string;
  name?: string;
  type?: AccountType;
  parentId?: string | null;
  isPostable?: boolean;
  isActive?: boolean;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fail = (error: unknown, fallback: string): never => {
  if (axios.isAxiosError(error)) {
    throw new Error(error.response?.data?.message || fallback);
  }
  throw new Error("An unknown error occurred");
};

/** GET /accounts — lista plana ordenada por código; el árbol se arma en pantalla. */
export const getAccounts = async (): Promise<Account[]> => {
  try {
    const res = await axios.get<{ items: Account[] }>(`${API_URL}/accounts`, {
      headers: authHeaders(),
    });
    return res.data.items ?? [];
  } catch (error) {
    return fail(error, "Error al cargar el plan de cuentas");
  }
};

export const createAccount = async (data: AccountInput): Promise<Account> => {
  try {
    const res = await axios.post<Account>(`${API_URL}/accounts`, data, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    return fail(error, "Error al crear la cuenta");
  }
};

export const updateAccount = async ({
  id,
  ...data
}: AccountInput & { id: string }): Promise<Account> => {
  try {
    const res = await axios.patch<Account>(`${API_URL}/accounts/${id}`, data, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    return fail(error, "Error al actualizar la cuenta");
  }
};

export const deleteAccount = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/accounts/${id}`, { headers: authHeaders() });
  } catch (error) {
    fail(error, "Error al eliminar la cuenta");
  }
};

/** POST /accounts/seed-default — carga el plan base (solo si la org no tiene cuentas). */
export const seedDefaultAccounts = async (): Promise<{ count: number }> => {
  try {
    const res = await axios.post<{ count: number }>(
      `${API_URL}/accounts/seed-default`,
      {},
      { headers: authHeaders() },
    );
    return res.data;
  } catch (error) {
    return fail(error, "Error al cargar el plan de cuentas base");
  }
};

/** Fila del plan a importar (parentCode en vez de parentId: el backend resuelve la jerarquía). */
export interface ImportAccountRow {
  code: string;
  shortCode: string | null;
  name: string;
  type: AccountType;
  parentCode: string | null;
  isPostable: boolean;
  normalBalance: "DEBIT" | "CREDIT" | null;
}

/** POST /accounts/import — REEMPLAZA el plan de cuentas de la organización (solo ADMIN). */
export const importAccounts = async (
  accounts: ImportAccountRow[],
): Promise<{ imported: number }> => {
  try {
    const res = await axios.post<{ imported: number }>(
      `${API_URL}/accounts/import`,
      { accounts },
      { headers: authHeaders() },
    );
    return res.data;
  } catch (error) {
    return fail(error, "Error al importar el plan de cuentas");
  }
};
