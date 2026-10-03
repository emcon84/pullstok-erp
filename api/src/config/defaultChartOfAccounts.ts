import type { AccountType } from "@prisma/client";

// Plan de cuentas base (Argentina) para PyMEs comerciales. Lista plana: el
// padre se deduce del código (se quita el último segmento), el tipo del primer
// dígito del rubro y `isPostable` de ser hoja (sin hijos). Los códigos son
// libres por organización: es solo un punto de partida editable.
export interface DefaultAccountSeed {
  code: string;
  name: string;
}

export const ROOT_TYPE_BY_DIGIT: Record<string, AccountType> = {
  "1": "ASSET",
  "2": "LIABILITY",
  "3": "EQUITY",
  "4": "INCOME",
  "5": "EXPENSE",
};

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountSeed[] = [
  { code: "1", name: "ACTIVO" },
  { code: "1.1", name: "Caja y Bancos" },
  { code: "1.1.01", name: "Caja" },
  { code: "1.1.02", name: "Banco cuenta corriente" },
  { code: "1.2", name: "Créditos por ventas" },
  { code: "1.2.01", name: "Deudores por ventas" },
  { code: "1.2.02", name: "Documentos a cobrar" },
  { code: "1.3", name: "Créditos fiscales" },
  { code: "1.3.01", name: "IVA Crédito Fiscal" },
  { code: "1.3.02", name: "Retenciones y percepciones sufridas" },
  { code: "1.4", name: "Bienes de cambio" },
  { code: "1.4.01", name: "Mercaderías" },
  { code: "1.5", name: "Bienes de uso" },
  { code: "1.5.01", name: "Rodados" },
  { code: "1.5.02", name: "Maquinarias" },
  { code: "1.5.03", name: "Muebles y útiles" },
  { code: "1.5.04", name: "Amortizaciones acumuladas" },
  { code: "2", name: "PASIVO" },
  { code: "2.1", name: "Deudas comerciales" },
  { code: "2.1.01", name: "Proveedores varios" },
  { code: "2.1.02", name: "Acreedores varios" },
  { code: "2.2", name: "Deudas fiscales" },
  { code: "2.2.01", name: "IVA Débito Fiscal" },
  { code: "2.2.02", name: "Ingresos Brutos a pagar" },
  { code: "2.3", name: "Deudas sociales" },
  { code: "2.3.01", name: "Sueldos a pagar" },
  { code: "2.3.02", name: "Cargas sociales a pagar" },
  { code: "2.4", name: "Deudas bancarias" },
  { code: "2.4.01", name: "Préstamos bancarios" },
  { code: "3", name: "PATRIMONIO NETO" },
  { code: "3.1", name: "Capital" },
  { code: "3.1.01", name: "Capital social" },
  { code: "3.2", name: "Reservas" },
  { code: "3.2.01", name: "Reservas" },
  { code: "3.3", name: "Resultados" },
  { code: "3.3.01", name: "Resultados no asignados" },
  { code: "3.3.02", name: "Resultado del ejercicio" },
  { code: "4", name: "INGRESOS" },
  { code: "4.1", name: "Ingresos por ventas" },
  { code: "4.1.01", name: "Ventas" },
  { code: "4.2", name: "Otros ingresos" },
  { code: "4.2.01", name: "Otros ingresos" },
  { code: "5", name: "EGRESOS" },
  { code: "5.1", name: "Costo de ventas" },
  { code: "5.1.01", name: "Costo de mercaderías vendidas" },
  { code: "5.2", name: "Gastos de personal" },
  { code: "5.2.01", name: "Sueldos y jornales" },
  { code: "5.2.02", name: "Cargas sociales" },
  { code: "5.3", name: "Gastos de administración y comercialización" },
  { code: "5.3.01", name: "Alquileres" },
  { code: "5.3.02", name: "Servicios" },
  { code: "5.3.03", name: "Impuestos y tasas" },
  { code: "5.3.04", name: "Gastos bancarios" },
  { code: "5.3.05", name: "Amortizaciones" },
];
