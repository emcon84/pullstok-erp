import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';
import bcrypt from 'bcryptjs';

/**
 * Test end-to-end (Supertest) del flujo completo de recuperación de contraseña.
 *
 * Corre contra la DB real de dev (nexo_db_dev:5434), mismo patrón que
 * tests/e2e/auth-kill-switch.e2e.test.ts.
 *
 * Requiere el SUPERADMIN seedeado (`prisma/seed.ts`):
 *   superadmin@nexo.com / superadmin123
 * Si no existe en la DB contra la que corre este test, correr `pnpm seed`
 * antes de ejecutar esta suite.
 *
 * También necesita un ADMIN seedeado:
 *   admin@demo.com / admin123
 */
describe('E2E: recuperación de contraseña (forgot + reset + login)', () => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.com';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';
  const employeeEmail = process.env.E2E_EMPLOYEE_EMAIL ?? 'empleado@demo.com';

  let adminId: string;

  beforeAll(async () => {
    // Buscar el ADMIN de demo para obtener su id
    const admin = await basePrisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (!admin) {
      console.warn(
        `[E2E password-recovery] Usuario admin no encontrado (${adminEmail}). ` +
          `Salteando suite. Ejecutá "pnpm seed" primero.`,
      );
      return;
    }
    adminId = admin.id;

    // Limpiar cualquier token residual de ejecuciones previas
    await basePrisma.user.update({
      where: { id: adminId },
      data: { resetToken: null, resetTokenExpiry: null },
    });
  });

  afterAll(async () => {
    // Limpiar tokens al final
    if (adminId) {
      await basePrisma.user.update({
        where: { id: adminId },
        data: { resetToken: null, resetTokenExpiry: null },
      });
    }
    await basePrisma.$disconnect();
  });

  // Helper: extrae el token del link de reset desde la DB
  async function extractRawToken(): Promise<string> {
    const user = await basePrisma.user.findUnique({
      where: { id: adminId },
    });
    if (!user?.resetToken) {
      throw new Error('No reset token found in DB');
    }
    // El token guardado es SHA-256. Para recovery necesitamos reconstruir
    // algo. Pero el link contiene el raw token, que no está en la DB.
    // NO podemos extraer el raw token de la DB (es un hash).
    // El E2E test debe interceptar el envío de mail o usar otro approach.
    //
    // Para este test, usamos el approach de "simular" el token:
    // el reset-password endpoint usa SHA-256(rawToken) === stored hash.
    // Pero NO podemos hacer reverse del hash.
    //
    // SOLUCIÓN: en entorno de test, exponemos el raw token por otra vía
    // o mockeamos crypto para que retorne un valor conocido.
    //
    // Alternativa: La implementación actual de forgotPassword usa
    // crypto.randomBytes(32) → no determinístico → no podemos saber el raw.
    //
    // Para testing E2E REAL, necesitamos una estrategia diferente:
    //  - Exponer el raw token en la respuesta (solo en test env)
    //  - O mockear crypto en test env
    //  - O usar un endpoint de test-only
    //
    // La opción más limpia: la implementación expone `rawToken` en el response
    // cuando NODE_ENV !== 'production'. Pero la spec dice "sin revelar datos".
    //
    // Para este E2E test, insertamos directamente un token conocido en la DB
    // y testeamos el endpoint de reset-password por separado.
    throw new Error(
      'extractRawToken: raw token is hashed and cannot be recovered. ' +
        'E2E tests inject known tokens directly.',
    );
  }

  // ========================================================================
  // forgot-password
  // ========================================================================

  describe('POST /api/auth/forgot-password', () => {
    it('(a) ADMIN válido → 200 con mensaje genérico', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: adminEmail });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Si el email está registrado');
    });

    it('(a) verifica que el token se guardó en la DB', async () => {
      const user = await basePrisma.user.findUnique({
        where: { email: adminEmail },
      });

      expect(user?.resetToken).toBeDefined();
      expect(user?.resetToken?.length).toBeGreaterThan(0);
      expect(user?.resetTokenExpiry).toBeDefined();
      // Expiry should be in the future
      expect(user!.resetTokenExpiry!.getTime()).toBeGreaterThan(Date.now());
    });

    it('(b) EMPLOYEE → 403', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: employeeEmail });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('administrador');
    });

    it('(c) email no registrado → 200 con MISMO mensaje genérico', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: `noexiste-${Date.now()}@demo.com` });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Si el email está registrado');
    });

    it('(d) rate limit: 4to request en 15 min → 429', async () => {
      const email = `ratelimit-${Date.now()}@demo.com`;

      // 3 requests permitidos
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email });
        expect(res.status).toBe(200);
      }

      // 4to → bloqueado
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('Demasiados intentos');
    });
  });

  // ========================================================================
  // reset-password (con token inyectado directamente en la DB)
  // ========================================================================

  describe('POST /api/auth/reset-password', () => {
    const crypto = require('crypto');
    const rawToken = 'e2e-test-raw-token-' + Date.now();
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const newPassword = 'nuevaClaveE2E123';

    beforeAll(async () => {
      if (!adminId) return;
      // Inyectar un token conocido en la DB para el admin
      await basePrisma.user.update({
        where: { id: adminId },
        data: {
          resetToken: hashedToken,
          resetTokenExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 min futuro
        },
      });
    });

    afterAll(async () => {
      if (!adminId) return;
      // Restaurar contraseña original
      const originalHash = await bcrypt.hash(adminPassword, 10);
      await basePrisma.user.update({
        where: { id: adminId },
        data: {
          password: originalHash,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
    });

    it('(e) token válido → 200, password actualizada, campos reset limpios', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Contraseña actualizada');

      // Verificar que los campos reset se limpiaron
      const user = await basePrisma.user.findUnique({
        where: { id: adminId },
      });
      expect(user?.resetToken).toBeNull();
      expect(user?.resetTokenExpiry).toBeNull();

      // Verificar que el password cambió
      const isMatch = await bcrypt.compare(newPassword, user!.password);
      expect(isMatch).toBe(true);
    });

    it('(h) login con la nueva contraseña funciona', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmail, password: newPassword });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('(f) token expirado → 400', async () => {
      // Inyectar token expirado
      const expiredRaw = 'expired-token-' + Date.now();
      const expiredHash = crypto
        .createHash('sha256')
        .update(expiredRaw)
        .digest('hex');

      await basePrisma.user.update({
        where: { id: adminId },
        data: {
          resetToken: expiredHash,
          resetTokenExpiry: new Date(Date.now() - 60_000), // 1 min en el pasado
        },
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: expiredRaw, newPassword: 'somePass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expiró');
    });

    it('(g) token inválido → 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'token-que-no-existe-' + Date.now(), newPassword: 'somePass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expiró');
    });
  });
});
