export interface Customer {
  id?: string;
  _id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  taxCondition?: string | null;
  address?: string | null;
  // Alta masiva desde sistema legado (GFLOW).
  code?: string | null;
  locality?: string | null;
  province?: string | null;
  zone?: string | null;
  isActive?: boolean;
  __v?: number;
}

export interface CreateCustomer {
  name?: string;
  email?: string;
  phone?: string;
  taxId?: string;
  taxCondition?: string;
  address?: string;
  code?: string;
  locality?: string;
  province?: string;
  zone?: string;
  isActive?: boolean;
}
