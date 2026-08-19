export interface Column {
  key: string;
  title: string;
}

export interface DataItem {
  [key: string]: any;
  id?: string;
  _id?: string;
  name: string;
  code?: string;
  image?: string;
  description?: string;
  // Alta manual envía categoryId (FK real, ver decisión sdd/onboarding-wizard
  // /category-contract). `category` queda opcional solo para datos legacy que
  // todavía puedan traerlo como string de display.
  categoryId?: string;
  category?: string;
  // Proveedor asociado (sdd/alican-wholesale-price-list/providers): id + objeto
  // desnormalizado { id, name } que trae la API en el include de productos.
  providerId?: string;
  provider?: { id?: string; name: string } | null;
  // Sección de planilla SECO MÁS RECIENTE (sdd/alican-plan-titles): la API la
  // expone como planSection con la jerarquía del PDF (brand/line/subline/
  // position). NUNCA incluye precios de proveedor.
  planSection?: {
    brand: string | null;
    line: string | null;
    subline: string | null;
    position: number;
  } | null;
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
