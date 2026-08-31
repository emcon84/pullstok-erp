import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Hoisted mocks: the form consumes the store-settings hooks and the branches
// service; we stub the hooks and let the real useBranches hook consume the
// mocked getBranches (wrapped in a QueryClientProvider).
vi.mock("@/services/branchService", () => ({
  getBranches: vi.fn(),
}));

vi.mock("@/components/hooks/useStoreSettings", () => ({
  useStoreSettings: vi.fn(),
  useUpdateStoreSettings: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { StoreSettingsForm } from "@/components/molecules/StoreSettingsForm";
import { getBranches } from "@/services/branchService";
import {
  useStoreSettings,
  useUpdateStoreSettings,
} from "@/components/hooks/useStoreSettings";

const mockGetBranches = vi.mocked(getBranches);
const mockUseStoreSettings = vi.mocked(useStoreSettings);
const mockUseUpdateStoreSettings = vi.mocked(useUpdateStoreSettings);

const branches = [
  { id: "hq", name: "Casa Central", isActive: true, createdAt: "" },
  { id: "b2", name: "Sucursal 2", isActive: true, createdAt: "" },
];

const baseSettings = {
  primaryColor: "#6d28d9",
  logoUrl: null,
  bannerUrl: null,
  tagline: null,
  showNewsletter: true,
  showBanner: true,
  badges: null,
  contactEmail: null,
  contactPhone: null,
  address: null,
  isPublished: false,
  storeBranchId: null,
};

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StoreSettingsForm />
    </QueryClientProvider>,
  );
}

describe("StoreSettingsForm — Sucursal de la tienda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBranches.mockResolvedValue(branches);
    mockUseStoreSettings.mockReturnValue({
      settings: { ...baseSettings },
      loading: false,
      error: null,
    });
    mockUseUpdateStoreSettings.mockReturnValue({
      updateSettings: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });
  });

  it("renders the branch selector with the hint about the casa central", async () => {
    renderForm();

    expect(
      await screen.findByText("Sucursal de la tienda"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/si no se configura.*casa central/i),
    ).toBeInTheDocument();
  });

  it("lists the organization branches as options", async () => {
    renderForm();

    fireEvent.click(await screen.findByRole("combobox", { name: /sucursal de la tienda/i }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Casa Central" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Sucursal 2" })).toBeInTheDocument();
    });
  });

  it("persists the selected branch with the settings update", async () => {
    const updateSettings = vi.fn();
    mockUseUpdateStoreSettings.mockReturnValue({
      updateSettings,
      loading: false,
      error: null,
      success: false,
    });
    renderForm();

    fireEvent.click(await screen.findByRole("combobox", { name: /sucursal de la tienda/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Sucursal 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ storeBranchId: "b2" }),
      ),
    );
  });

  it("pre-selects the stored storeBranchId when the settings already configure one", async () => {
    mockUseStoreSettings.mockReturnValue({
      settings: { ...baseSettings, storeBranchId: "b2" },
      loading: false,
      error: null,
    });
    renderForm();

    const trigger = screen.getByRole("combobox", { name: /sucursal de la tienda/i });
    // Radix renders the selected item's text via a hidden-fragment portal,
    // which fills in asynchronously after mount.
    await waitFor(() => expect(trigger).toHaveTextContent("Sucursal 2"));
  });
});
