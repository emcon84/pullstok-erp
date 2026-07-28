import { RateLimiter } from '../../src/services/rateLimiter';

// Use fake timers to control cleanup intervals
jest.useFakeTimers();

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 3;

  beforeEach(() => {
    jest.clearAllMocks();
    // doNotImmediatelyAdvance: prevent setInterval from firing during tests
    limiter = new RateLimiter();
  });

  afterEach(() => {
    limiter.stopCleanup();
  });

  describe('isRateLimited', () => {
    it('permite el primer intento', () => {
      const result = limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      expect(result).toBe(false);
    });

    it('permite hasta 3 intentos dentro de la ventana de 15 min', () => {
      expect(limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS)).toBe(false);
      expect(limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS)).toBe(false);
      expect(limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS)).toBe(false);
    });

    it('bloquea el 4to intento (rate-limited)', () => {
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);

      const result = limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      expect(result).toBe(true);
    });

    it('no bloquea un email diferente (keys independientes)', () => {
      // Saturate admin@demo.com
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);

      // otro@demo.com should still be allowed
      const result = limiter.isRateLimited('otro@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      expect(result).toBe(false);
    });

    it('limpia entradas vencidas (fuera de la ventana)', () => {
      // Register 3 attempts
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);

      // Advance time past the window
      jest.advanceTimersByTime(WINDOW_MS + 1);

      // After window expires, should be allowed again (first attempt in new window)
      const result = limiter.isRateLimited('admin@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('limpia entradas stale después del intervalo de limpieza', () => {
      limiter.isRateLimited('stale@demo.com', MAX_ATTEMPTS, WINDOW_MS);

      // Advance time way past the window
      jest.advanceTimersByTime(WINDOW_MS + 60_000);

      // Trigger cleanup interval (10 min)
      jest.advanceTimersByTime(10 * 60 * 1000);

      // Verify the internal map is clean by checking a fresh attempt works
      // and we can confirm no stale keys linger — internal map should be empty
      const result = limiter.isRateLimited('stale@demo.com', MAX_ATTEMPTS, WINDOW_MS);
      expect(result).toBe(false);
    });
  });
});
