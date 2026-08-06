import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks: capture the response-interceptor handler registered by
// authInterceptor on the global axios instance, and stub the session cleanup
// so we can assert WHAT gets called on a 403 OUTSIDE_BUSINESS_HOURS.
const { mockInterceptorsUse, mockClearSession } = vi.hoisted(() => ({
  mockInterceptorsUse: vi.fn(),
  mockClearSession: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { interceptors: { response: { use: mockInterceptorsUse } } },
}));

vi.mock("../controllers/authController", () => ({
  clearSession: mockClearSession,
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Import after mocks so the interceptor registers its handler on the mock.
import "../lib/authInterceptor";

// The interceptor registers its reject-handler ONCE at import time; capture it
// there so beforeEach's vi.clearAllMocks() (which resets the call history)
// can't wipe it out.
interface InterceptorError {
  response?: { status: number; data: Record<string, unknown> };
  config?: { url?: string };
}

const handler = mockInterceptorsUse.mock.calls[0][1] as (
  error: InterceptorError,
) => Promise<unknown>;

const makeError = (
  status: number,
  data: Record<string, unknown>,
  url = "/api/sales",
): InterceptorError => ({
  response: { status, data },
  config: { url },
});

describe("authInterceptor — 403 OUTSIDE_BUSINESS_HOURS", () => {
  let hrefValues: string[] = [];

  const setLocation = (pathname: string) => {
    Object.defineProperty(window, "location", {
      value: {
        pathname,
        set href(v: string) {
          hrefValues.push(v);
        },
        get href() {
          return `http://localhost${pathname}`;
        },
      },
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hrefValues = [];
    setLocation("/dashboard");
  });

  it("limpia la sesión y redirige a /fuera-de-horario ante un 403 OUTSIDE_BUSINESS_HOURS", async () => {
    await expect(
      handler(makeError(403, { error: "OUTSIDE_BUSINESS_HOURS", message: "Fuera del horario comercial." })),
    ).rejects.toBeDefined();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(hrefValues).toContain("/fuera-de-horario");
  });

  it("NO redirige en loop si ya estamos en /fuera-de-horario", async () => {
    setLocation("/fuera-de-horario");

    await expect(
      handler(makeError(403, { error: "OUTSIDE_BUSINESS_HOURS", message: "Fuera del horario comercial." })),
    ).rejects.toBeDefined();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(hrefValues).not.toContain("/fuera-de-horario");
  });

  it("NO limpia la sesión ante otros 403 (p.ej. PLAN_LIMIT)", async () => {
    await expect(
      handler(makeError(403, { error: "PLAN_LIMIT", resource: "products" })),
    ).rejects.toBeDefined();

    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it("NO limpia la sesión ante 401 de login/refresh (credenciales inválidas)", async () => {
    await expect(
      handler(makeError(401, { message: "bad credentials" }, "/api/auth/login")),
    ).rejects.toBeDefined();

    expect(mockClearSession).not.toHaveBeenCalled();
  });
});
