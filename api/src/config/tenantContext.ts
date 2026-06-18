import { AsyncLocalStorage } from "async_hooks";

export type UserRole = "SUPERADMIN" | "ADMIN" | "EMPLOYEE";

export interface TenantContext {
  userId: string;
  role: UserRole;
  // null SOLO para el SUPERADMIN (la plataforma). Los demás siempre tienen org.
  organizationId: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Ejecuta `fn` con el contexto del request actual disponible vía getTenantContext(). */
export const runWithTenant = <T>(ctx: TenantContext, fn: () => T): T =>
  storage.run(ctx, fn);

/** Devuelve el contexto del request actual (o undefined si no hay). */
export const getTenantContext = (): TenantContext | undefined =>
  storage.getStore();

/**
 * Devuelve el organizationId del request actual o lanza error.
 * Usar cuando una operación REQUIERE pertenecer a una organización.
 */
export const requireOrganizationId = (): string => {
  const ctx = storage.getStore();
  if (!ctx || !ctx.organizationId) {
    throw new Error("No hay contexto de organización (tenant) en este request");
  }
  return ctx.organizationId;
};
