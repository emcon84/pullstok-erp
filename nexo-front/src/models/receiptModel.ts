export interface Receipt {
  id?: string;
  _id?: string;
  type: string;
  relatedDocument: string;
  receiptNumber: string;
  createdAt: string;
  sale?: {
    id?: string;
    _id?: string;
    totalAmount: number;
    saleDate: string;
    customer?: {
      id?: string;
      _id?: string;
      name: string;
    };
    items?: Array<{
      product: {
        id?: string;
        _id?: string;
        name: string;
      };
      quantity: number;
      price: number;
    }>;
    products?: Array<{
      product: {
        id?: string;
        _id?: string;
        name: string;
      };
      quantity: number;
      price: number;
    }>;
  };
}
