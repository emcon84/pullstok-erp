import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMe } from "../services/onboardingService";
import { API_URL } from "../constants";
import { useBranding, useUpdateBranding } from "../components/hooks/useBranding";
import { AppBrandingForm } from "../components/molecules/AppBrandingForm";
import { OrganizationFiscalForm } from "../components/molecules/OrganizationFiscalForm";
import { ArcaSettingsForm } from "../components/molecules/ArcaSettingsForm";
import { Loader } from "../components/atoms/loader";

export const BrandingSettings = () => {
  const { branding, loading } = useBranding();
  const { updateBranding, loading: isSaving } = useUpdateBranding();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [downloading, setDownloading] = useState(false);

  const handleDownloadBackup = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/backups/latest`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      // Trigger browser download from blob
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers["content-disposition"];
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
      link.setAttribute("download", filenameMatch?.[1] || "backup.sql.gz");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Backup descargado");
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Error al descargar el backup";
      toast.error(typeof msg === "string" ? msg : "Error al descargar el backup");
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

      {/* Datos fiscales del emisor — solo ADMIN: el endpoint PATCH /organizations/me
          es requireRole("ADMIN") (spec: los datos fiscales viajan al PDF de factura) */}
      {me?.role === "ADMIN" && (
        <OrganizationFiscalForm organization={me?.organization} />
      )}

      {/* Configuración ARCA (deuda técnica item 6): antes solo se podía por API */}
      {me?.role === "ADMIN" && <ArcaSettingsForm />}

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
                  Descargando...
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

