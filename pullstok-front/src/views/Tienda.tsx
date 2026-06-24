import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Lock, Store } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getMe } from "../services/onboardingService";
import { StoreSettingsForm } from "../components/molecules/StoreSettingsForm";
import { StoreProductsList } from "../components/molecules/StoreProductsList";
import { Loader } from "../components/atoms/loader";

// Mismos planes que habilitan la tienda en el backend (checkStoreEnabled.ts):
// derivado del Plan, nunca un flag propio, para no desincronizarse.
const STORE_PLANS = ["PRO", "PREMIUM"];

type Tab = "settings" | "products";

export const Tienda = () => {
  const [tab, setTab] = useState<Tab>("settings");
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (isLoading || !me) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  const plan = me.organization.plan ?? "BASICO";
  const storeEnabled = STORE_PLANS.includes(plan);
  const storeUrl = me.organization.slug
    ? `https://${me.organization.slug}.pullstok.com`
    : null;

  const copyUrl = () => {
    if (!storeUrl) return;
    navigator.clipboard.writeText(storeUrl);
    toast.success("URL copiada");
  };

  if (!storeEnabled) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            La tienda online no está disponible en tu plan
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Actualizá tu plan a PRO o PREMIUM para publicar productos y tener
            tu propia tienda online en {`{tu-negocio}.pullstok.com`}.
          </p>
        </div>
        <Button onClick={() => toast.info("Contactá a soporte para mejorar tu plan")}>
          Mejorar plan
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tienda online</h1>
          <p className="text-sm text-muted-foreground">
            Configurá la marca y elegí qué productos se publican.
          </p>
        </div>
        {storeUrl && (
          <Card className="flex items-center gap-2 px-3 py-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              {storeUrl.replace("https://", "")}
            </a>
            <Button variant="ghost" size="icon-sm" onClick={copyUrl}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Card>
        )}
      </div>

      <div className="flex gap-2 border-b">
        <button
          className={cn(
            "px-3 py-2 text-sm font-medium transition-colors",
            tab === "settings"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("settings")}
        >
          Configuración
        </button>
        <button
          className={cn(
            "px-3 py-2 text-sm font-medium transition-colors",
            tab === "products"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("products")}
        >
          Productos
        </button>
      </div>

      {tab === "settings" ? <StoreSettingsForm /> : <StoreProductsList />}
    </div>
  );
};
