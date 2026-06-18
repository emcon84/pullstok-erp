export interface Column {
  key: string;
  title: string;
}

export interface DataItem {
  [key: string]: any;
  id?: string;
  _id?: string;
  name: string;
  image?: string;
  description?: string;
  category: string;
  price: number | string;
  quantity: number | string;
}

type ValidationRule =
  | "required"
  | "email"
  | "minLength"
  | "maxLength"
  | "pattern"
  | "custom"
  | "noSQL"; // Puedes agregar más tipos según sea necesario.

export interface Validation {
  rule: ValidationRule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any; // 'value' será utilizado para reglas que necesiten parámetros adicionales.
  message?: string; // Mensaje personalizado para la validación.
}
