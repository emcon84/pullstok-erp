import { Request, Response } from 'express';
import customerController from '../../src/controllers/customerController';
import { prisma } from '../../src/config/db';

jest.mock('../../src/config/db', () => ({
  prisma: {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  customer: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const mockRequest = (params: any = {}, body: any = {}) =>
  ({ params, body } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Customer Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('crea un cliente y devuelve 201', async () => {
      const customerData = { name: 'John Doe', email: 'john@example.com' };
      const created = { id: 'c1', ...customerData };
      mockedPrisma.customer.create.mockResolvedValue(created);

      const req = mockRequest({}, customerData);
      const res = mockResponse();

      await customerController.createCustomer(req, res);

      expect(mockedPrisma.customer.create).toHaveBeenCalledWith({ data: customerData });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('devuelve 400 si Prisma lanza un error', async () => {
      mockedPrisma.customer.create.mockRejectedValue(new Error('Error creating customer'));

      const req = mockRequest({}, { name: 'John Doe', email: 'john@example.com' });
      const res = mockResponse();

      await customerController.createCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error creating customer' });
    });
  });

  describe('getCustomers', () => {
    it('devuelve 200 con la lista de clientes', async () => {
      const customers = [{ id: 'c1', name: 'John Doe' }];
      mockedPrisma.customer.findMany.mockResolvedValue(customers);

      const req = mockRequest();
      const res = mockResponse();

      await customerController.getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(customers);
    });

    it('devuelve 500 si Prisma lanza un error', async () => {
      mockedPrisma.customer.findMany.mockRejectedValue(new Error('DB down'));

      const req = mockRequest();
      const res = mockResponse();

      await customerController.getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB down' });
    });
  });

  describe('getCustomerById', () => {
    it('devuelve 200 con el cliente si existe', async () => {
      const customer = { id: 'c1', name: 'John Doe' };
      mockedPrisma.customer.findFirst.mockResolvedValue(customer);

      const req = mockRequest({ id: 'c1' });
      const res = mockResponse();

      await customerController.getCustomerById(req, res);

      expect(mockedPrisma.customer.findFirst).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(customer);
    });

    it('devuelve 404 si el cliente no existe', async () => {
      mockedPrisma.customer.findFirst.mockResolvedValue(null);

      const req = mockRequest({ id: 'inexistente' });
      const res = mockResponse();

      await customerController.getCustomerById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });
  });

  describe('updateCustomer', () => {
    it('actualiza y devuelve 200 con el cliente actualizado', async () => {
      const updated = { id: 'c1', name: 'Jane Doe' };
      mockedPrisma.customer.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.customer.findFirst.mockResolvedValue(updated);

      const req = mockRequest({ id: 'c1' }, { name: 'Jane Doe' });
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(mockedPrisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Jane Doe' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('devuelve 404 si no hay ningún cliente para actualizar', async () => {
      mockedPrisma.customer.updateMany.mockResolvedValue({ count: 0 });

      const req = mockRequest({ id: 'inexistente' }, { name: 'Jane Doe' });
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(mockedPrisma.customer.findFirst).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });

    it('devuelve 400 si Prisma lanza un error', async () => {
      mockedPrisma.customer.updateMany.mockRejectedValue(new Error('bad data'));

      const req = mockRequest({ id: 'c1' }, { name: 'Jane Doe' });
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'bad data' });
    });
  });

  describe('deleteCustomer', () => {
    it('elimina y devuelve 200', async () => {
      mockedPrisma.customer.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: 'c1' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(mockedPrisma.customer.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer deleted successfully' });
    });

    it('devuelve 404 si no hay ningún cliente para eliminar', async () => {
      mockedPrisma.customer.deleteMany.mockResolvedValue({ count: 0 });

      const req = mockRequest({ id: 'inexistente' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });

    it('devuelve 500 si Prisma lanza un error', async () => {
      mockedPrisma.customer.deleteMany.mockRejectedValue(new Error('DB down'));

      const req = mockRequest({ id: 'c1' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB down' });
    });
  });
});
