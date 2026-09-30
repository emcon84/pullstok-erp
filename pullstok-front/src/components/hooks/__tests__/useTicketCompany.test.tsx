import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/services/onboardingService", () => ({ getMe: vi.fn() }));
vi.mock("@/components/hooks/useBranches", () => ({ useBranches: vi.fn() }));
vi.mock("@/contexts/BrandingContext", () => ({ useBrandingContext: vi.fn() }));

import { useTicketCompany } from "../useTicketCompany";
import { getMe } from "@/services/onboardingService";
import { useBranches } from "@/components/hooks/useBranches";
import { useBrandingContext } from "@/contexts/BrandingContext";

const org = { taxId: "30-1", taxCondition: "Resp. Inscripto", address: "Org 1", phone: "111" };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useTicketCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBrandingContext).mockReturnValue({
      branding: { displayName: "Mi Pet Shop" },
    } as never);
    vi.mocked(useBranches).mockReturnValue({ branches: [] } as never);
  });

  it("builds the company from branding + organization, with the bundled logo", async () => {
    vi.mocked(getMe).mockResolvedValue({ role: "VENDEDOR", organization: org } as never);
    const { result } = renderHook(() => useTicketCompany("b1"), { wrapper });
    await waitFor(() => expect(result.current.taxId).toBe("30-1"));
    expect(result.current).toMatchObject({
      businessName: "Mi Pet Shop",
      taxCondition: "Resp. Inscripto",
      address: "Org 1",
      phone: "111",
    });
    expect(result.current.logoUrl).toBeTruthy();
    expect(useBranches).toHaveBeenLastCalledWith(false);
  });

  it("lets ADMIN list branches and overrides address/phone with the branch's", async () => {
    vi.mocked(getMe).mockResolvedValue({ role: "ADMIN", organization: org } as never);
    vi.mocked(useBranches).mockReturnValue({
      branches: [{ id: "b1", address: "Suc 9", phone: "999" }],
    } as never);
    const { result } = renderHook(() => useTicketCompany("b1"), { wrapper });
    await waitFor(() => expect(result.current.taxId).toBe("30-1"));
    expect(result.current.address).toBe("Suc 9");
    expect(result.current.phone).toBe("999");
    expect(result.current.taxId).toBe("30-1");
    expect(useBranches).toHaveBeenLastCalledWith(true);
  });
});
