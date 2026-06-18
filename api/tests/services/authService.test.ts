import { Request, Response } from 'express';
import { register, login } from '../../src/controllers/authController';
import AuthService from '../../src/services/authServices';

jest.mock('../../src/services/authServices');

const mockRequest = (body: any) => ({
  body,
} as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return 201 status', async () => {
      const user = { email: 'test@example.com', password: 'password123' };
      (AuthService.register as jest.Mock).mockResolvedValue(user);

      const req = mockRequest(user);
      const res = mockResponse();

      await register(req, res);

      expect(AuthService.register).toHaveBeenCalledWith(user.email, user.password);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(user);
    });

    it('should return 400 status if an error occurs', async () => {
      const errorMessage = 'Registration error';
      (AuthService.register as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('login', () => {
    it('should login a user and return 200 status with token', async () => {
      const token = 'fake-jwt-token';
      (AuthService.login as jest.Mock).mockResolvedValue(token);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(AuthService.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ token });
    });

    it('should return 400 status if an error occurs', async () => {
      const errorMessage = 'Login error';
      (AuthService.login as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });
});
