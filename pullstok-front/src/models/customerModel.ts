export interface Customer {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  phone: string;
  taxId?: string | null;
  taxCondition?: string | null;
  address?: string | null;
  __v?: number;
}

export interface CreateCustomer {
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  taxCondition?: string;
  address?: string;
}
