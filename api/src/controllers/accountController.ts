import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import {
  buildDefaultChartRows,
  resolveAccountType,
  validateImportRows,
  validateDeletion,
  validateParentCanHaveChildren,
  validatePostableChange,
  validateReparent,
  type ImportAccountRow,
} from "../services/accountRules";

const uniqueViolationMessage = (error: any): string | null => {
  if (error?.code !== "P2002") return null;
  const fields = String(error?.meta?.target ?? "");
  if (fields.includes("shortCode")) return "Ya existe una cuenta con ese código corto";
  if (fields.includes("code")) return "Ya existe una cuenta con ese código";
  return "Ya existe una cuenta con esos datos";
};

/** Todas las cuentas de la org (para validar jerarquía en memoria). */
const loadAll = (organizationId: string) =>
  prisma.account.findMany({
    where: { organizationId },
    select: { id: true, parentId: true, type: true, isPostable: true },
  });

/** GET /accounts — lista plana ordenada por código; el front arma el árbol. */
export const listAccounts = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const items = await prisma.account.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
    });
    return res.status(200).json({ items });
  } catch (error: any) {
    console.error("Error listando cuentas:", error);
    return res.status(500).json({ message: "Error al listar el plan de cuentas" });
  }
};

/** POST /accounts */
export const createAccount = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { parentId, type: requestedType, ...rest } = req.body;

    let parent: { id: string; type: any; isPostable: boolean } | null = null;
    if (parentId) {
      parent = await prisma.account.findFirst({
        where: { id: parentId, organizationId },
        select: { id: true, type: true, isPostable: true },
      });
      if (!parent) return res.status(400).json({ message: "La cuenta madre no existe" });
      const parentError = validateParentCanHaveChildren(parent);
      if (parentError) return res.status(400).json({ message: parentError });
    }
    const { type, error } = resolveAccountType(parent, requestedType);
    if (error) return res.status(400).json({ message: error });

    const account = await prisma.account.create({
      data: { ...rest, type, parentId: parent?.id ?? null, organizationId },
    });
    return res.status(201).json(account);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    console.error("Error creando cuenta:", error);
    return res.status(500).json({ message: "Error al crear la cuenta" });
  }
};

/** PATCH /accounts/:id — updateMany (scope por org), nunca update singular. */
export const updateAccount = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const accounts = await loadAll(organizationId);
    const current = accounts.find((a) => a.id === id);
    if (!current) return res.status(404).json({ message: "Cuenta no encontrada" });

    const data: any = { ...req.body };
    const parentId: string | null = "parentId" in data ? data.parentId ?? null : current.parentId;

    if ("parentId" in data) {
      const cycle = validateReparent(accounts, id, parentId);
      if (cycle) return res.status(400).json({ message: cycle });
    }
    const parent = parentId ? accounts.find((a) => a.id === parentId) ?? null : null;
    if (parentId && !parent) return res.status(400).json({ message: "La cuenta madre no existe" });
    if (parent && "parentId" in data && parent.id !== current.parentId) {
      const parentError = validateParentCanHaveChildren(parent);
      if (parentError) return res.status(400).json({ message: parentError });
    }

    // Con madre el tipo se hereda; sin madre se conserva el actual si no viene otro.
    const { type, error } = resolveAccountType(parent, data.type ?? (parent ? undefined : current.type));
    if (error) return res.status(400).json({ message: error });
    if (type !== current.type) {
      // Cambiar el tipo de una cuenta con subcuentas dejaría el árbol inconsistente.
      if (accounts.some((a) => a.parentId === id)) {
        return res.status(400).json({ message: "No se puede cambiar el tipo de una cuenta con subcuentas" });
      }
      data.type = type;
    } else {
      delete data.type;
    }

    if (typeof data.isPostable === "boolean") {
      const postableError = validatePostableChange(accounts, id, data.isPostable);
      if (postableError) return res.status(400).json({ message: postableError });
    }

    const result = await prisma.account.updateMany({ where: { id, organizationId }, data });
    if (result.count === 0) return res.status(404).json({ message: "Cuenta no encontrada" });
    const account = await prisma.account.findFirst({ where: { id, organizationId } });
    return res.status(200).json(account);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    console.error("Error actualizando cuenta:", error);
    return res.status(500).json({ message: "Error al actualizar la cuenta" });
  }
};

/** DELETE /accounts/:id — rechazado si tiene subcuentas (a futuro: ni asientos). */
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { id } = req.params;
    const accounts = await loadAll(organizationId);
    if (!accounts.some((a) => a.id === id)) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }
    const blocked = validateDeletion(accounts, id);
    if (blocked) return res.status(409).json({ message: blocked });
    const result = await prisma.account.deleteMany({ where: { id, organizationId } });
    if (result.count === 0) return res.status(404).json({ message: "Cuenta no encontrada" });
    return res.status(200).json({ message: "Cuenta eliminada" });
  } catch (error: any) {
    if (error?.code === "P2003") {
      return res.status(409).json({ message: "No se puede eliminar una cuenta que tiene subcuentas" });
    }
    console.error("Error eliminando cuenta:", error);
    return res.status(500).json({ message: "Error al eliminar la cuenta" });
  }
};

/** POST /accounts/seed-default — carga el plan base solo si la org no tiene cuentas. */
export const seedDefaultAccounts = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const rows = buildDefaultChartRows();
    const created = await prisma.$transaction(async (tx) => {
      // Dentro del $transaction el tx no hereda el scope de org: va explícito.
      const existing = await tx.account.count({ where: { organizationId } });
      if (existing > 0) return null;
      const idByCode = new Map(rows.map((r) => [r.code, randomUUID()]));
      // Los padres preceden a sus hijos en el plan base → el orden de inserción
      // respeta la FK parentId.
      await tx.account.createMany({
        data: rows.map((r) => ({
          id: idByCode.get(r.code) as string,
          organizationId,
          code: r.code,
          name: r.name,
          type: r.type,
          parentId: r.parentCode ? (idByCode.get(r.parentCode) as string) : null,
          isPostable: r.isPostable,
        })),
      });
      return rows.length;
    });
    if (created === null) {
      return res.status(409).json({ message: "La organización ya tiene un plan de cuentas" });
    }
    return res.status(201).json({ message: "Plan de cuentas base cargado", count: created });
  } catch (error: any) {
    console.error("Error cargando plan de cuentas base:", error);
    return res.status(500).json({ message: "Error al cargar el plan de cuentas base" });
  }
};

/**
 * POST /accounts/import — reemplaza TODO el plan de la org por el importado.
 * Hoy nada referencia a Account por FK (aún no hay asientos), por eso reemplazar
 * es seguro. TODO: cuando existan asientos, bloquear la importación si hay movimientos.
 */
export const importAccounts = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const rows = req.body.accounts as ImportAccountRow[];
    const invalid = validateImportRows(rows);
    if (invalid) return res.status(400).json({ message: invalid });

    await prisma.$transaction(
      async (tx) => {
        // parentId → null primero: la autorrelación es ON DELETE RESTRICT y un
        // único deleteMany sobre una jerarquía puede fallar según el orden.
        await tx.account.updateMany({ where: { organizationId }, data: { parentId: null } });
        await tx.account.deleteMany({ where: { organizationId } });
        const idByCode = new Map(rows.map((r) => [r.code, randomUUID()]));
        await tx.account.createMany({
          data: rows.map((r) => ({
            id: idByCode.get(r.code) as string,
            organizationId,
            code: r.code,
            shortCode: r.shortCode || null,
            name: r.name,
            type: r.type,
            parentId: r.parentCode ? (idByCode.get(r.parentCode) as string) : null,
            isPostable: r.isPostable,
            normalBalance: r.normalBalance ?? null,
          })),
        });
      },
      { timeout: 30000 },
    );
    return res.status(200).json({ imported: rows.length });
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    console.error("Error importando plan de cuentas:", error);
    return res.status(500).json({ message: "Error al importar el plan de cuentas" });
  }
};

const accountController = {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  seedDefaultAccounts,
  importAccounts,
};
export default accountController;
