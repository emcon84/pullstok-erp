import { Request, Response } from "express";
import { prisma } from "../config/db";

// Violación de unicidad de Prisma (email o código legado repetidos en la org).
const uniqueViolationMessage = (error: any): string | null => {
  if (error?.code !== "P2002") return null;
  const fields = String(error?.meta?.target ?? "");
  if (fields.includes("code")) return "Ya existe un cliente con ese código";
  if (fields.includes("email")) return "Ya existe un cliente con ese email";
  return "Ya existe un cliente con esos datos";
};

// Create a new customer (organizationId lo inyecta la extension de Prisma)
const createCustomer = async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.create({ data: req.body });
    res.status(201).json(customer);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    res.status(400).json({ message: error.message });
  }
};

// Get all customers (scopeado por org). Sin query params devuelve TODOS (activos
// e inactivos, back-compat). Filtros opcionales: ?q= (nombre/código/CUIT/email)
// y ?active=true|false (los inactivos siguen siendo recuperables con "false"
// o sin filtro).
const getCustomers = async (req: Request, res: Response) => {
  try {
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
    const active = req.query?.active;
    const where: any = {};
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { taxId: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    const customers = await prisma.customer.findMany(
      Object.keys(where).length ? { where } : undefined,
    );
    res.status(200).json(customers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single customer by ID
const getCustomerById = async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id },
    });
    if (customer) {
      res.status(200).json(customer);
    } else {
      res.status(404).json({ message: "Customer not found" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Update a customer by ID
const updateCustomer = async (req: Request, res: Response) => {
  try {
    const result = await prisma.customer.updateMany({
      where: { id: req.params.id },
      data: req.body,
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id },
    });
    res.status(200).json(customer);
  } catch (error: any) {
    const dup = uniqueViolationMessage(error);
    if (dup) return res.status(409).json({ message: dup });
    res.status(400).json({ message: error.message });
  }
};

// Delete a customer by ID
const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const result = await prisma.customer.deleteMany({
      where: { id: req.params.id },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.status(200).json({ message: "Customer deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};
