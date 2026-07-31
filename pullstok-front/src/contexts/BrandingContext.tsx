/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useBranding } from "../components/hooks/useBranding";

export interface Branding {
  displayName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  showDisplayName: boolean;
}

const DEFAULT_BRANDING: Branding = {
  displayName: "Pullstok",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: null,
  showDisplayName: true,
};

interface BrandingContextValue {
  branding: Branding;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  isLoading: false,
});

export const useBrandingContext = () => useContext(BrandingContext);

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const { branding, loading } = useBranding();

  const resolved: Branding = branding
    ? {
        displayName: branding.displayName,
        logoUrl: branding.logoUrl,
        faviconUrl: branding.faviconUrl,
        primaryColor: branding.primaryColor,
        showDisplayName: branding.showDisplayName,
      }
    : DEFAULT_BRANDING;

  // Only override --primary when a custom color was explicitly set.
  // When primaryColor is null (no DB row), the CSS theme's own --primary
  // (light: #6366f1 / dark: #818cf8) handles active-link contrast correctly.
  useEffect(() => {
    if (resolved.primaryColor) {
      document.documentElement.style.setProperty("--primary", resolved.primaryColor);
    }
  }, [resolved.primaryColor]);

  // Sync favicon dynamically when faviconUrl is set.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (resolved.faviconUrl) {
      if (link) {
        link.href = resolved.faviconUrl;
      } else {
        const newLink = document.createElement("link");
        newLink.rel = "icon";
        newLink.href = resolved.faviconUrl;
        document.head.appendChild(newLink);
      }
    }
    // No cleanup needed — on unmount the page is navigating away.
  }, [resolved.faviconUrl]);

  return (
    <BrandingContext.Provider value={{ branding: resolved, isLoading: loading }}>
      {children}
    </BrandingContext.Provider>
  );
};
