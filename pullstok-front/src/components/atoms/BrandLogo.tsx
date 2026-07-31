import { useState } from "react";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  logoUrl?: string | null;
  displayName?: string | null;
  size?: "sidebar" | "mobile";
}

/**
 * Renders the org's logo or a monogram fallback. Used in both sidebar
 * (desktop) and mobile header so branding is consistent everywhere.
 */
export const BrandLogo = ({
  logoUrl,
  displayName,
  size = "sidebar",
}: BrandLogoProps) => {
  const [imgError, setImgError] = useState(false);

  const fallbackLetter =
    displayName?.trim().charAt(0).toUpperCase() || "P";

  const sizeClasses =
    size === "sidebar"
      ? "h-8 w-8 text-lg"
      : "h-7 w-7 text-base";

  const hasLogo = logoUrl && !imgError;

  return hasLogo ? (
    <img
      src={logoUrl!}
      alt={displayName ?? "Logo"}
      onError={() => setImgError(true)}
      className={cn("rounded object-contain", sizeClasses)}
    />
  ) : (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground",
        sizeClasses,
      )}
    >
      {fallbackLetter}
    </div>
  );
};
