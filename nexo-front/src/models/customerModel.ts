export interface Customer {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  phone: string;
  __v?: number;
}

export interface CreateCustomer {
  name: string;
  email: string;
  phone: string;
}
