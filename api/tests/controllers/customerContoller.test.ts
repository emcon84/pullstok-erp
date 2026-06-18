import { Request, Response } from 'express';
import customerController from '../../src/controllers/customerController';
import Customer from '../../src/models/customerModel';

jest.mock('../../src/models/customerModel');

const mockRequest = (params: any, body?: any) => ({
  params,
  body,
} as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Customer Controller', () => {
  describe('createCustomer', () => {
    it('should create a new customer and return 201 status', async () => {
      const customerData = { name: 'John Doe', email: 'john@example.com' };
      (Customer.prototype.save as jest.Mock).mockResolvedValue(customerData);
      
      const req = mockRequest({}, customerData);
      const res = mockResponse();
      
      await customerController.createCustomer(req, res);      
    
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 400 status if there is an error', async () => {
      const errorMessage = 'Error creating customer';
      (Customer.prototype.save as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({}, { name: 'John Doe', email: 'john@example.com' });
      const res = mockResponse();

      await customerController.createCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      console.log(res.json)
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('getCustomers', () => {
    it('should get all customers and return 200 status', async () => {
      const customers = [{ name: 'John Doe', email: 'john@example.com' }];
      (Customer.find as jest.Mock).mockResolvedValue(customers);

      const req = mockRequest({});
      const res = mockResponse();

      await customerController.getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(customers);
    });

    it('should return 500 status if there is an error', async () => {
      const errorMessage = 'Error getting customers';
      (Customer.find as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({});
      const res = mockResponse();

      await customerController.getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('getCustomerById', () => {
    it('should get a customer by ID and return 200 status', async () => {
      const customer = { name: 'John Doe', email: 'john@example.com' };
      (Customer.findById as jest.Mock).mockResolvedValue(customer);

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.getCustomerById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(customer);
    });

    it('should return 404 status if customer is not found', async () => {
      (Customer.findById as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.getCustomerById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });

    it('should return 500 status if there is an error', async () => {
      const errorMessage = 'Error getting customer';
      (Customer.findById as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.getCustomerById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('updateCustomer', () => {
    it('should update a customer and return 200 status', async () => {
      const updatedCustomer = { name: 'John Doe', email: 'john@example.com' };
      (Customer.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedCustomer);

      const req = mockRequest({ id: '123' }, updatedCustomer);
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedCustomer);
    });

    it('should return 404 status if customer is not found', async () => {
      (Customer.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({ id: '123' }, { name: 'John Doe', email: 'john@example.com' });
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });

    it('should return 400 status if there is an error', async () => {
      const errorMessage = 'Error updating customer';
      (Customer.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({ id: '123' }, { name: 'John Doe', email: 'john@example.com' });
      const res = mockResponse();

      await customerController.updateCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('deleteCustomer', () => {
    it('should delete a customer and return 200 status', async () => {
      (Customer.findByIdAndDelete as jest.Mock).mockResolvedValue({});

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer deleted successfully' });
    });

    it('should return 404 status if customer is not found', async () => {
      (Customer.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Customer not found' });
    });

    it('should return 500 status if there is an error', async () => {
      const errorMessage = 'Error deleting customer';
      (Customer.findByIdAndDelete as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await customerController.deleteCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });
});
