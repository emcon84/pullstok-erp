import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks — vitest lifts these above all static imports so the module
// graph sees the mock before any consumer module is evaluated.
// ---------------------------------------------------------------------------
vi.mock("../components/hooks/useBranding", () => ({
  useBranding: vi.fn(),
  useUpdateBranding: vi.fn(),
}));

vi.mock("../services/onboardingService", () => ({
  getMe: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports (after mock registration — vitest hoists the mock above)
// ---------------------------------------------------------------------------
import { BrandLogo } from "../components/atoms/BrandLogo";
import { BrandingProvider, useBrandingContext } from "../contexts/BrandingContext";
import { AppBrandingForm } from "../components/molecules/AppBrandingForm";
import { BrandingSettings } from "../views/BrandingSettings";
import { PLAN_LIMITS } from "../constants/planLimits";
import type { Plan } from "../constants/planLimits";
import { useBranding, useUpdateBranding } from "../components/hooks/useBranding";

// ============================================================================
// STEP 1 – BrandLogo (FB1, FB2, FB3)
// ============================================================================
describe("BrandLogo", () => {
  it("renders an <img> when logoUrl is provided", () => {
    render(
      <BrandLogo logoUrl="https://example.com/logo.png" displayName="Acme" />,
    );

    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/logo.png");
    expect(img).toHaveAttribute("alt", "Acme");
  });

  it("renders a monogram with the first letter when logoUrl is null", () => {
    render(<BrandLogo logoUrl={null} displayName="FerreMax" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });

  it('renders monogram with "P" as ultimate fallback when displayName is null', () => {
    render(<BrandLogo logoUrl={null} displayName={null} />);

    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it('renders monogram with "P" when displayName is whitespace-only', () => {
    render(<BrandLogo logoUrl={null} displayName="   " />);

    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it('applies the "sidebar" size classes to the monogram by default', () => {
    render(<BrandLogo logoUrl={null} displayName="Test" />);

    const monogram = screen.getByText("T");
    expect(monogram.className).toContain("h-10");
    expect(monogram.className).toContain("w-10");
    expect(monogram.className).toContain("text-xl");
  });

  it('applies the "mobile" size classes when size="mobile"', () => {
    render(<BrandLogo logoUrl={null} displayName="Test" size="mobile" />);

    const monogram = screen.getByText("T");
    expect(monogram.className).toContain("h-7");
    expect(monogram.className).toContain("w-7");
    expect(monogram.className).toContain("text-base");
  });

  it('applies "sidebar" size classes to the <img> when logo and sidebar variant used', () => {
    render(
      <BrandLogo
        logoUrl="https://example.com/img.png"
        displayName="Test"
        size="sidebar"
      />,
    );

    const img = screen.getByRole("img");
    expect(img.className).toContain("h-10");
    expect(img.className).toContain("w-10");
  });

  it("uses the first letter capitalised from displayName", () => {
    render(<BrandLogo logoUrl={null} displayName="miTienda" />);

    expect(screen.getByText("M")).toBeInTheDocument();
  });
});

// ============================================================================
// STEP 2 – BrandingContext (FB1, FB4)
// ============================================================================
describe("BrandingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.style.removeProperty("--primary");
    // Remove any favicon <link> left by prior tests
    document
      .querySelectorAll("link[rel='icon']")
      .forEach((el) => el.remove());
  });

  it('provides default values ("Pullstok", "#111827") when useBranding returns no data', () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: null,
      loading: false,
      error: null,
    });

    function TestConsumer() {
      const { branding, isLoading } = useBrandingContext();
      return (
        <div>
          <span data-testid="name">{branding.displayName}</span>
          <span data-testid="color">{branding.primaryColor}</span>
          <span data-testid="loading">{String(isLoading)}</span>
        </div>
      );
    }

    render(
      <BrandingProvider>
        <TestConsumer />
      </BrandingProvider>,
    );

    expect(screen.getByTestId("name")).toHaveTextContent("Pullstok");
    // default primaryColor is null — no inline CSS override, theme handles it
    expect(screen.getByTestId("color")).toHaveTextContent("");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("provides custom branding values when useBranding returns persisted data", () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: {
        displayName: "FerreMax",
        primaryColor: "#dc2626",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: "https://example.com/favicon.ico",
        showDisplayName: true,
      },
      loading: false,
      error: null,
    });

    function TestConsumer() {
      const { branding } = useBrandingContext();
      return (
        <div>
          <span data-testid="name">{branding.displayName}</span>
          <span data-testid="color">{branding.primaryColor}</span>
          <span data-testid="logo">{branding.logoUrl}</span>
          <span data-testid="favicon">{branding.faviconUrl}</span>
        </div>
      );
    }

    render(
      <BrandingProvider>
        <TestConsumer />
      </BrandingProvider>,
    );

    expect(screen.getByTestId("name")).toHaveTextContent("FerreMax");
    expect(screen.getByTestId("color")).toHaveTextContent("#dc2626");
    expect(screen.getByTestId("logo")).toHaveTextContent(
      "https://example.com/logo.png",
    );
    expect(screen.getByTestId("favicon")).toHaveTextContent(
      "https://example.com/favicon.ico",
    );
  });

  it("sets --primary CSS custom property on documentElement", () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: {
        displayName: null,
        primaryColor: "#22c55e",
        logoUrl: null,
        faviconUrl: null,
        showDisplayName: true,
      },
      loading: false,
      error: null,
    });

    function TestConsumer() {
      useBrandingContext();
      return null;
    }

    render(
      <BrandingProvider>
        <TestConsumer />
      </BrandingProvider>,
    );

    expect(
      document.documentElement.style.getPropertyValue("--primary"),
    ).toBe("#22c55e");
  });

  it("useBrandingContext returns default context values when used outside BrandingProvider", () => {
    function TestConsumer() {
      const { branding, isLoading } = useBrandingContext();
      return (
        <div>
          <span data-testid="name">{branding.displayName}</span>
          <span data-testid="color">{branding.primaryColor}</span>
          <span data-testid="loading">{String(isLoading)}</span>
        </div>
      );
    }

    render(<TestConsumer />);

    expect(screen.getByTestId("name")).toHaveTextContent("Pullstok");
    // default context: primaryColor is null — theme CSS handles it
    expect(screen.getByTestId("color")).toHaveTextContent("");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("creates a favicon <link> element when faviconUrl is set and none exists", () => {
    // Ensure no existing favicon link
    document
      .querySelectorAll("link[rel='icon']")
      .forEach((el) => el.remove());

    vi.mocked(useBranding).mockReturnValue({
      branding: {
        displayName: null,
        primaryColor: "#111827",
        logoUrl: null,
        faviconUrl: "https://example.com/custom.ico",
        showDisplayName: true,
      },
      loading: false,
      error: null,
    });

    function TestConsumer() {
      useBrandingContext();
      return null;
    }

    render(
      <BrandingProvider>
        <TestConsumer />
      </BrandingProvider>,
    );

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    expect(link).not.toBeNull();
    expect(link!.href).toBe("https://example.com/custom.ico");
  });
});

// ============================================================================
// STEP 3 – AppBrandingForm (FS1, FS2, FS3, FS4)
// ============================================================================
describe("AppBrandingForm", () => {
  it("renders all form fields: displayName, color picker, logo upload, favicon upload", () => {
    render(
      <AppBrandingForm branding={null} onSave={vi.fn()} isSaving={false} />,
    );

    // Display name input
    expect(screen.getByLabelText(/nombre para mostrar/i)).toBeInTheDocument();

    // Color picker (type="color")
    const colorInput = document.getElementById("primaryColor");
    expect(colorInput).toBeInTheDocument();
    expect(colorInput).toHaveAttribute("type", "color");

    // Hex text input
    const hexInputs = screen.getAllByPlaceholderText("#111827");
    expect(hexInputs.length).toBeGreaterThanOrEqual(1);

    // Logo file input
    const logoInput = document.getElementById("logoUrl");
    expect(logoInput).toBeInTheDocument();
    expect(logoInput).toHaveAttribute("type", "file");
    expect(logoInput).toHaveAttribute("accept", "image/*");

    // Favicon file input
    const faviconInput = document.getElementById("faviconUrl");
    expect(faviconInput).toBeInTheDocument();
    expect(faviconInput).toHaveAttribute("type", "file");
    expect(faviconInput).toHaveAttribute("accept", "image/*");
  });

  it("pre-fills form fields with existing branding data", () => {
    render(
      <AppBrandingForm
        branding={{
          displayName: "MiERP",
          primaryColor: "#f59e0b",
          logoUrl: "https://example.com/logo.png",
          faviconUrl: "https://example.com/fav.ico",
          showDisplayName: true,
        }}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    // Display name pre-filled
    const displayNameInput = screen.getByLabelText(
      /nombre para mostrar/i,
    ) as HTMLInputElement;
    expect(displayNameInput.value).toBe("MiERP");

    // Color picker pre-filled
    const colorInput = document.getElementById(
      "primaryColor",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("#f59e0b");

    // Logo preview image visible
    const previewImages = screen.getAllByRole("img");
    const logoPreview = previewImages.find(
      (img) => img.getAttribute("alt") === "Logo preview",
    );
    expect(logoPreview).toBeInTheDocument();
    expect(logoPreview).toHaveAttribute("src", "https://example.com/logo.png");

    // Favicon preview image visible
    const faviconPreview = previewImages.find(
      (img) => img.getAttribute("alt") === "Favicon preview",
    );
    expect(faviconPreview).toBeInTheDocument();
    expect(faviconPreview).toHaveAttribute(
      "src",
      "https://example.com/fav.ico",
    );
  });

  it("shows the save button enabled when not saving", () => {
    render(
      <AppBrandingForm branding={null} onSave={vi.fn()} isSaving={false} />,
    );

    const saveButton = screen.getByRole("button", {
      name: /guardar ajustes/i,
    });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it('shows "Guardando..." and disables the button when isSaving is true', () => {
    render(
      <AppBrandingForm branding={null} onSave={vi.fn()} isSaving={true} />,
    );

    const saveButton = screen.getByRole("button", {
      name: /guardando/i,
    });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("handles null branding gracefully — renders empty/default fields", () => {
    render(
      <AppBrandingForm branding={null} onSave={vi.fn()} isSaving={false} />,
    );

    const displayNameInput = screen.getByLabelText(
      /nombre para mostrar/i,
    ) as HTMLInputElement;
    expect(displayNameInput.value).toBe("");

    const colorInput = document.getElementById(
      "primaryColor",
    ) as HTMLInputElement;
    expect(colorInput.value).toBe("#111827");

    // No preview images when there is no branding data
    expect(screen.queryByAltText("Logo preview")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Favicon preview")).not.toBeInTheDocument();
  });
});

// ============================================================================
// STEP 4 – BrandingSettings page (FS1)
// ============================================================================
describe("BrandingSettings", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  it('renders the page title "Ajustes" when data is loaded', () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: {
        displayName: "TestCo",
        primaryColor: "#111827",
        logoUrl: null,
        faviconUrl: null,
        showDisplayName: true,
      },
      loading: false,
      error: null,
    });
    vi.mocked(useUpdateBranding).mockReturnValue({
      updateBranding: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });

    renderWithProviders(<BrandingSettings />);

    expect(
      screen.getByRole("heading", { name: /ajustes/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("shows a loading state while branding is being fetched", () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: null,
      loading: true,
      error: null,
    });
    vi.mocked(useUpdateBranding).mockReturnValue({
      updateBranding: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });

    renderWithProviders(<BrandingSettings />);

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /ajustes/i }),
    ).not.toBeInTheDocument();
  });

  it("renders AppBrandingForm with pre-filled data when branding is loaded", () => {
    vi.mocked(useBranding).mockReturnValue({
      branding: {
        displayName: "LoadedCo",
        primaryColor: "#a855f7",
        logoUrl: null,
        faviconUrl: null,
        showDisplayName: true,
      },
      loading: false,
      error: null,
    });
    vi.mocked(useUpdateBranding).mockReturnValue({
      updateBranding: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });

    renderWithProviders(<BrandingSettings />);

    const displayNameInput = screen.getByLabelText(
      /nombre para mostrar/i,
    ) as HTMLInputElement;
    expect(displayNameInput.value).toBe("LoadedCo");
  });
});

// ============================================================================
// STEP 5 – Plan gating (PG1, PG2, PG3)
// ============================================================================
describe("Plan gating — branding module", () => {
  it.each([
    ["PRO" as Plan, true],
    ["PREMIUM" as Plan, true],
    ["BASICO" as Plan, false],
  ])("plan %s has branding=%s", (plan, expected) => {
    expect(PLAN_LIMITS[plan].modules.includes("branding")).toBe(expected);
  });

  it("BASIC plan modules do NOT contain branding", () => {
    expect(PLAN_LIMITS.BASICO.modules).not.toContain("branding");
  });

  it("PRO plan modules contain branding", () => {
    expect(PLAN_LIMITS.PRO.modules).toContain("branding");
  });

  it("PREMIUM plan modules contain branding", () => {
    expect(PLAN_LIMITS.PREMIUM.modules).toContain("branding");
  });
});
