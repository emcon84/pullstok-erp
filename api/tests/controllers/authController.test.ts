import { Request, Response } from 'express';
import {
  login,
  refresh,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
} from '../../src/controllers/authController';
import AuthService from '../../src/services/authServices';
import { AuthedRequest } from '../../src/middlewares/authMiddleware';

jest.mock('../../src/services/authServices');

const mockedAuthService = AuthService as jest.Mocked<typeof AuthService>;

const mockRequest = (body: any = {}, user?: { id: string }) =>
  ({ body, user } as unknown as AuthedRequest);

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

  describe('login', () => {
    it('devuelve 200 con el resultado del service en credenciales válidas', async () => {
      const result = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'u1', email: 'test@example.com' },
      };
      mockedAuthService.login.mockResolvedValue(result as any);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await login(req, res);

      expect(AuthService.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('devuelve 400 si falta email o password (sin llamar al service)', async () => {
      const req = mockRequest({ email: 'test@example.com' });
      const res = mockResponse();

      await login(req, res);

      expect(AuthService.login).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Email y contraseña son requeridos',
      });
    });

    it('devuelve 401 si el service lanza error de credenciales', async () => {
      mockedAuthService.login.mockRejectedValue(new Error('Credenciales inválidas'));

      const req = mockRequest({ email: 'test@example.com', password: 'wrong' });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Credenciales inválidas' });
    });
  });

  describe('refresh', () => {
    it('devuelve 200 con un nuevo access token', async () => {
      mockedAuthService.refresh.mockResolvedValue({ accessToken: 'nuevo' } as any);

      const req = mockRequest({ refreshToken: 'un-refresh-valido' });
      const res = mockResponse();

      await refresh(req, res);

      expect(AuthService.refresh).toHaveBeenCalledWith('un-refresh-valido');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ accessToken: 'nuevo' });
    });

    it('devuelve 401 si el refresh token es inválido', async () => {
      mockedAuthService.refresh.mockRejectedValue(
        new Error('Refresh token inválido o expirado'),
      );

      const req = mockRequest({ refreshToken: 'roto' });
      const res = mockResponse();

      await refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh token inválido o expirado',
      });
    });
  });

  describe('me', () => {
    it('devuelve 200 con el usuario autenticado', async () => {
      const usuario = { id: 'u1', email: 'test@example.com', role: 'ADMIN' };
      mockedAuthService.me.mockResolvedValue(usuario as any);

      const req = mockRequest({}, { id: 'u1' });
      const res = mockResponse();

      await me(req, res);

      expect(AuthService.me).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(usuario);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      mockedAuthService.me.mockRejectedValue(new Error('Usuario no encontrado'));

      const req = mockRequest({}, { id: 'inexistente' });
      const res = mockResponse();

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Usuario no encontrado' });
    });
  });

  describe('changePassword', () => {
    it('devuelve 200 al cambiar la contraseña correctamente', async () => {
      mockedAuthService.changePassword.mockResolvedValue(undefined as any);

      const req = mockRequest(
        { currentPassword: 'vieja1234', newPassword: 'nueva12345' },
        { id: 'u1' },
      );
      const res = mockResponse();

      await changePassword(req, res);

      expect(AuthService.changePassword).toHaveBeenCalledWith(
        'u1',
        'vieja1234',
        'nueva12345',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Contraseña actualizada correctamente',
      });
    });

    it('devuelve 400 si faltan las contraseñas (sin llamar al service)', async () => {
      const req = mockRequest({ currentPassword: 'vieja1234' }, { id: 'u1' });
      const res = mockResponse();

      await changePassword(req, res);

      expect(AuthService.changePassword).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Faltan la contraseña actual y/o la nueva',
      });
    });

    it('devuelve 400 si el service rechaza el cambio', async () => {
      mockedAuthService.changePassword.mockRejectedValue(
        new Error('La contraseña actual es incorrecta'),
      );

      const req = mockRequest(
        { currentPassword: 'mal', newPassword: 'nueva12345' },
        { id: 'u1' },
      );
      const res = mockResponse();

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'La contraseña actual es incorrecta',
      });
    });
  });

  describe('forgotPassword', () => {
    it('devuelve 200 con mensaje genérico al solicitar reset exitoso', async () => {
      mockedAuthService.forgotPassword.mockResolvedValue({
        message: 'Si el email está registrado, recibirás un enlace de recuperación.',
      } as any);

      const req = mockRequest({ email: 'admin@demo.com' });
      const res = mockResponse();

      await forgotPassword(req, res);

      expect(AuthService.forgotPassword).toHaveBeenCalledWith('admin@demo.com');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Si el email está registrado, recibirás un enlace de recuperación.',
      });
    });

    it('devuelve 403 cuando el service rechaza por rol EMPLOYEE', async () => {
      const err: any = new Error('Contactá a tu administrador para restablecer tu contraseña');
      err.statusCode = 403;
      mockedAuthService.forgotPassword.mockRejectedValue(err);

      const req = mockRequest({ email: 'empleado@demo.com' });
      const res = mockResponse();

      await forgotPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Contactá a tu administrador para restablecer tu contraseña',
      });
    });

    it('devuelve 429 cuando se excede el rate limit', async () => {
      const err: any = new Error('Demasiados intentos. Esperá 15 minutos.');
      err.statusCode = 429;
      mockedAuthService.forgotPassword.mockRejectedValue(err);

      const req = mockRequest({ email: 'admin@demo.com' });
      const res = mockResponse();

      await forgotPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Demasiados intentos. Esperá 15 minutos.',
      });
    });
  });

  describe('resetPassword', () => {
    it('devuelve 200 con contraseña actualizada exitosamente', async () => {
      mockedAuthService.resetPassword.mockResolvedValue({
        message: 'Contraseña actualizada. Ya podés iniciar sesión.',
      } as any);

      const req = mockRequest({ token: 'valid-token', newPassword: 'newPass123' });
      const res = mockResponse();

      await resetPassword(req, res);

      expect(AuthService.resetPassword).toHaveBeenCalledWith('valid-token', 'newPass123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Contraseña actualizada. Ya podés iniciar sesión.',
      });
    });

    it('devuelve 400 cuando el token expiró o es inválido', async () => {
      mockedAuthService.resetPassword.mockRejectedValue(
        new Error('El enlace expiró o no es válido. Pedí uno nuevo.'),
      );

      const req = mockRequest({ token: 'expired', newPassword: 'newPass123' });
      const res = mockResponse();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'El enlace expiró o no es válido. Pedí uno nuevo.',
      });
    });
  });
});
