import AuthService from '../../src/services/authServices';
import { basePrisma } from '../../src/config/db';
import bcrypt from 'bcryptjs';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from '../../src/utils/jwtUtils';

jest.mock('../../src/config/db', () => ({
  basePrisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('../../src/utils/jwtUtils', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

const mockedPrisma = basePrisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};
const mockedBcrypt = bcrypt as unknown as { compare: jest.Mock; hash: jest.Mock };
const mockedGenAccess = generateAccessToken as jest.Mock;
const mockedGenRefresh = generateRefreshToken as jest.Mock;
const mockedVerify = verifyToken as jest.Mock;

const baseUser = {
  id: 'u1',
  email: 'test@example.com',
  password: 'hashed-password',
  role: 'ADMIN',
  organizationId: 'org-1',
  isActive: true,
  mustChangePassword: false,
  organization: { isActive: true },
};

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('devuelve tokens + datos del usuario en credenciales válidas', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedGenAccess.mockReturnValue('access-token');
      mockedGenRefresh.mockReturnValue('refresh-token');

      const result = await AuthService.login('test@example.com', 'password123');

      expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: { organization: true },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'u1',
          email: 'test@example.com',
          role: 'ADMIN',
          organizationId: 'org-1',
          mustChangePassword: false,
        },
      });
    });

    it('lanza "Credenciales inválidas" si el usuario no existe', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      await expect(AuthService.login('nadie@example.com', 'x')).rejects.toThrow(
        'Credenciales inválidas',
      );
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('lanza "Credenciales inválidas" si el usuario está inactivo', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(AuthService.login('test@example.com', 'x')).rejects.toThrow(
        'Credenciales inválidas',
      );
    });

    it('kill switch: rechaza si la organización está suspendida', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        organization: { isActive: false },
      });

      await expect(AuthService.login('test@example.com', 'x')).rejects.toThrow(
        'Tu organización está suspendida, contactá al administrador.',
      );
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('lanza "Credenciales inválidas" si la contraseña no coincide', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(AuthService.login('test@example.com', 'mal')).rejects.toThrow(
        'Credenciales inválidas',
      );
      expect(mockedGenAccess).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('emite un nuevo access token con un refresh token válido', async () => {
      mockedVerify.mockReturnValue({ id: 'u1', type: 'refresh' });
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedGenAccess.mockReturnValue('nuevo-access');

      const result = await AuthService.refresh('refresh-valido');

      expect(result).toEqual({ accessToken: 'nuevo-access' });
    });

    it('rechaza si el token provisto no es de tipo refresh', async () => {
      mockedVerify.mockReturnValue({ id: 'u1', type: 'access' });

      await expect(AuthService.refresh('un-access')).rejects.toThrow(
        'El token provisto no es un refresh token',
      );
    });

    it('rechaza si verifyToken lanza (token inválido o expirado)', async () => {
      mockedVerify.mockImplementation(() => {
        throw new Error('expired');
      });

      await expect(AuthService.refresh('roto')).rejects.toThrow(
        'Refresh token inválido o expirado',
      );
    });
  });

  describe('changePassword', () => {
    it('actualiza la contraseña con datos válidos', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedBcrypt.hash.mockResolvedValue('nuevo-hash');

      await AuthService.changePassword('u1', 'vieja1234', 'nueva12345');

      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'nuevo-hash', mustChangePassword: false },
      });
    });

    it('rechaza si la contraseña actual es incorrecta', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(
        AuthService.changePassword('u1', 'mal', 'nueva12345'),
      ).rejects.toThrow('La contraseña actual es incorrecta');
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rechaza si la nueva contraseña tiene menos de 8 caracteres', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true);

      await expect(
        AuthService.changePassword('u1', 'vieja1234', 'corta'),
      ).rejects.toThrow('La nueva contraseña debe tener al menos 8 caracteres');
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
