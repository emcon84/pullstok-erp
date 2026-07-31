import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMe } from "../services/onboardingService";
import { getLatestBackup } from "../services/backupService";
import { useBranding, useUpdateBranding } from "../components/hooks/useBranding";
import { AppBrandingForm } from "../components/molecules/AppBrandingForm";
import { Loader } from "../components/atoms/loader";

export const BrandingSettings = () => {
  const { branding, loading } = useBranding();
  const { updateBranding, loading: isSaving } = useUpdateBranding();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [downloading, setDownloading] = useState(false);

  const handleDownloadBackup = async () => {
    setDownloading(true);
    try {
      const { url } = await getLatestBackup();
      window.open(url, "_self");
    } catch (error: any) {
      toast.error(error.message || "Error al obtener el backup");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
        <p className="text-muted-foreground">
          Personalizá el nombre, color y logos de tu ERP.
        </p>
      </div>

      <AppBrandingForm
        branding={branding}
        onSave={updateBranding}
        isSaving={isSaving}
      />

      {/* Backup download section — ADMIN only, no plan gating (spec U2, U6) */}
      {me?.role === "ADMIN" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Backups</CardTitle>
            <CardDescription>
              Descargá una copia de seguridad de los datos de tu organización.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleDownloadBackup}
              disabled={downloading}
              variant="outline"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando enlace...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar backup
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

