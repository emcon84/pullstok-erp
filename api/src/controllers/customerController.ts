import { Request, Response } from "express";
import { prisma } from "../config/db";

// Create a new customer (organizationId lo inyecta la extension de Prisma)
const createCustomer = async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.create({ data: req.body });
    res.status(201).json(customer);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all customers (scopeado por org)
const getCustomers = async (_req: Request, res: Response) => {
  try {
    const customers = await prisma.customer.findMany();
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
