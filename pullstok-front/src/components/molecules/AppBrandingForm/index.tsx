import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { API_URL } from "../../../constants";
import type { AppBranding } from "../../../services/brandingService";

// Reuse the same upload flow as StoreSettingsForm (POST /api/image/upload → URL).
const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("image", file);
  const response = await fetch(`${API_URL}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error al subir la imagen");
  return data.url;
};

interface AppBrandingFormProps {
  branding: AppBranding | null;
  onSave: (data: Partial<AppBranding>) => void;
  isSaving: boolean;
}

export const AppBrandingForm = ({
  branding,
  onSave,
  isSaving,
}: AppBrandingFormProps) => {
  const [form, setForm] = useState<Partial<AppBranding>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  useEffect(() => {
    if (branding) setForm(branding);
  }, [branding]);

  const handleField = <K extends keyof AppBranding>(
    key: K,
    value: AppBranding[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logoUrl" | "faviconUrl",
    setUploading: (v: boolean) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      handleField(field, url);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    // Send null for empty strings so the backend treats them as clearing the field
    const payload: Partial<AppBranding> = {
      ...form,
      displayName: form.displayName?.trim() || null,
    };
    onSave(payload);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-tight">Identidad</h3>

        <div className="space-y-2">
          <Label htmlFor="displayName">Nombre para mostrar</Label>
          <Input
            id="displayName"
            value={form.displayName ?? ""}
            onChange={(e) => handleField("displayName", e.target.value)}
            placeholder="Pullstok"
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="primaryColor">Color principal</Label>
          <div className="flex items-center gap-2">
            <input
              id="primaryColor"
              type="color"
              value={form.primaryColor ?? "#111827"}
              onChange={(e) => handleField("primaryColor", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
            />
            <Input
              value={form.primaryColor ?? ""}
              onChange={(e) => handleField("primaryColor", e.target.value)}
              placeholder="#111827"
              className="font-mono"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-tight">Logos</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo</Label>
            {form.logoUrl && (
              <img
                src={form.logoUrl}
                alt="Logo preview"
                className="h-16 w-16 rounded-lg border object-contain"
              />
            )}
            <Input
              id="logoUrl"
              type="file"
              accept="image/*"
              disabled={uploadingLogo}
              onChange={(e) =>
                handleFileUpload(e, "logoUrl", setUploadingLogo)
              }
              className="cursor-pointer file:mr-2 file:text-muted-foreground"
            />
            {uploadingLogo && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3 animate-pulse" /> Subiendo...
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faviconUrl">Favicon</Label>
            {form.faviconUrl && (
              <img
                src={form.faviconUrl}
                alt="Favicon preview"
                className="h-16 w-16 rounded-lg border object-contain"
              />
            )}
            <Input
              id="faviconUrl"
              type="file"
              accept="image/*"
              disabled={uploadingFavicon}
              onChange={(e) =>
                handleFileUpload(e, "faviconUrl", setUploadingFavicon)
              }
              className="cursor-pointer file:mr-2 file:text-muted-foreground"
            />
            {uploadingFavicon && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3 animate-pulse" /> Subiendo...
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar ajustes"}
        </Button>
      </div>
    </div>
  );
};
