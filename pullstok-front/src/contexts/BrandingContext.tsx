/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useBranding } from "../components/hooks/useBranding";

export interface Branding {
  displayName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
}

const DEFAULT_BRANDING: Branding = {
  displayName: "Pullstok",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#111827",
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
      }
    : DEFAULT_BRANDING;

  // Sync --primary CSS custom property on the document root so Tailwind's
  // bg-primary / text-primary / ring references pick it up automatically.
  useEffect(() => {
    document.documentElement.style.setProperty("--primary", resolved.primaryColor);
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
