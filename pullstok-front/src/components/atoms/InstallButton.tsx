import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tracks the beforeinstallprompt event and shows an "Instalar" button
 * when the browser offers PWA installation (Chrome/Edge desktop + Android).
 * iOS Safari does NOT fire this event — users install via Share → Add to Home Screen.
 *
 * Usage: <InstallButton /> — renders nothing unless installable.
 */
export const InstallButton = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const handleBeforeInstall = useCallback((e: Event) => {
    e.preventDefault();
    setDeferred(e as BeforeInstallPromptEvent);
  }, []);

  const handleInstalled = useCallback(() => {
    setInstalled(true);
    setDeferred(null);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    // Check if already running as standalone PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [handleBeforeInstall, handleInstalled]);

  const handleInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setDeferred(null);
  };

  // Don't render if already installed or not installable
  if (installed || !deferred) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={handleInstall}
    >
      <Download className="h-3.5 w-3.5" />
      Instalar app
    </Button>
  );
};
