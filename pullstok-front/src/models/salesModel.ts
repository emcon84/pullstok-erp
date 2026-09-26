import { ProductsProps } from "./productsModel";
import { PaymentMethod } from "./cashSessionModel";

export type SaleMode =
  | "BOLSA_CERRADA"
  | "POR_PESO"
  | "POR_MONTO"
  | "POR_UNIDAD"
  | "POR_UNIDAD_BLISTER";

export interface CartItem {
  product: ProductsProps;
  quantity: number;
  totalPrice: number;
  saleMode?: SaleMode;
  /** Id de la celda PriceKgPrice (venta suelta, loose-lines-stock): cuando
   *  viene, el backend identifica la línea por loosePriceId y descuenta los kg
   *  del LooseStock de la celda en lugar de bajar stock del producto físico. */
  loosePriceId?: string;
  /** Nombre de la línea suelta ("MARCA · TIPO") usado en el payload. */
  looseName?: string;
  /** sdd/venta-pastillas-sueltas-blister: cuántas pastillas trae ESE blister,
   *  conteo AD-HOC cargado por el vendedor. Solo presente cuando saleMode ===
   *  "POR_UNIDAD_BLISTER"; el backend lo exige para recomputar el precio. */
  piecesPerBlister?: number | null;
}

export interface SaleRequest {
  products: {
    productId?: string;
    quantity: string;
    name?: string;
    price: string;
    description?: string;
    category?: string;
    saleMode?: SaleMode;
    loosePriceId?: string;
    looseName?: string;
    piecesPerBlister?: number;
  }[];
  orderId?: string;
  /** Desglose de medios de pago (R6/R7): la suma debe igualar el total. */
  payments?: { method: PaymentMethod; amount: number }[];
  /** Id de la caja OPEN del vendedor (R8/R9). */
  cashSessionId?: string;
  /** Descuento porcentual a nivel venta (0..100). Ausente = 0 = sin descuento
   *  (backward-compat). El backend materializa el monto en $ y repondera el
   *  total = subtotal − descuento. */
  discountPct?: number;
  /** Recargo porcentual de tarjeta de crédito (0..100), aplicado solo a las
   *  filas TARJETA_CREDITO de `payments` (montos BASE). Ausente = sin recargo:
   *  solo se envía cuando es > 0. El servidor calcula el monto. */
  surchargePct?: number;
}

export interface Sale {
  id?: string;
  _id?: string;
  items?: {
    id?: string;
    _id?: string;
    name: string;
    quantity: number;
    price: number;
    category: string;
    productId: string;
    /** Modo de venta del renglón: POR_PESO / POR_MONTO = línea suelta de la
     *  planilla; ausente/BOLSA_CERRADA = bolsa % física. */
    saleMode?: SaleMode;
    /** Id de la celda PriceKgPrice cuando el renglón es venta suelta. */
    loosePriceId?: string;
  }[];
  products?: {
    id?: string;
    _id?: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  /** Descuento aplicado a la venta en $ (backend). Backward-compat: undefined
   *  en ventas legacy sin descuento. */
  discount?: number;
  /** Recargo de tarjeta de crédito en $ (backend). `totalAmount` lo INCLUYE.
   *  undefined en ventas legacy sin recargo. */
  surcharge?: number;
  saleDate: string;
  createdAt?: string;
  __v?: number;
  /** Presente cuando la venta se generó procesando un pedido (1:1 Order). */
  orderId?: string;
  /** Presente cuando el backend incluye el select de invoice (getAllSales WS3). */
  invoice?: { id: string } | null;
  /** Desglose de medios de pago (R6/R7). El backend lo incluye en getAllSales
   *  para el dashboard "Ventas por medio de pago". Σ amounts == totalAmount. */
  payments?: { method: PaymentMethod; amount: number }[];
}
