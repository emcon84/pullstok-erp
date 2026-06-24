import { useEffect, useState } from "react";
import { Plus, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { API_URL } from "../../../constants";
import {
  StoreSettings,
  StoreBadge,
} from "../../../services/storeSettingsService";
import {
  useStoreSettings,
  useUpdateStoreSettings,
} from "../../hooks/useStoreSettings";
import { Loader } from "../../atoms/loader";

const MAX_BADGES = 3;

// Sube un archivo al endpoint genérico de R2 (mismo flow que el form de
// productos en GenericModal/ModalContent) y devuelve la URL pública.
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

export const StoreSettingsForm = () => {
  const { settings, loading } = useStoreSettings();
  const { updateSettings, loading: saving } = useUpdateStoreSettings();

  const [form, setForm] = useState<Partial<StoreSettings>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const handleField = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logoUrl" | "bannerUrl",
    setUploading: (v: boolean) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      handleField(field, url);
    } catch {
      // El toast de error general ya cubre el caso por la mutación; acá solo
      // evitamos romper la UI si la subida falla.
    } finally {
      setUploading(false);
    }
  };

  const badges = form.badges ?? [];

  const addBadge = () => {
    if (badges.length >= MAX_BADGES) return;
    handleField("badges", [...badges, { title: "", subtitle: "" }]);
  };

  const removeBadge = (index: number) => {
    handleField("badges", badges.filter((_, i) => i !== index));
  };

  const updateBadge = (index: number, field: keyof StoreBadge, value: string) => {
    handleField(
      "badges",
      badges.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );
  };

  const handleSave = () => {
    updateSettings(form);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-tight">Marca</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Color principal</Label>
            <div className="flex items-center gap-2">
              <input
                id="primaryColor"
                type="color"
                value={form.primaryColor ?? "#6d28d9"}
                onChange={(e) => handleField("primaryColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
              />
              <Input
                value={form.primaryColor ?? ""}
                onChange={(e) => handleField("primaryColor", e.target.value)}
                placeholder="#6d28d9"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={form.tagline ?? ""}
              onChange={(e) => handleField("tagline", e.target.value)}
              placeholder="Ej: Calidad y confianza desde 1990"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo</Label>
            {form.logoUrl && (
              <img
                src={form.logoUrl}
                alt="Logo"
                className="h-16 w-16 rounded-lg border object-contain"
              />
            )}
            <Input
              id="logoUrl"
              type="file"
              accept="image/*"
              disabled={uploadingLogo}
              onChange={(e) => handleFileUpload(e, "logoUrl", setUploadingLogo)}
              className="cursor-pointer file:mr-2 file:text-muted-foreground"
            />
            {uploadingLogo && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3 animate-pulse" /> Subiendo...
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bannerUrl">Banner</Label>
            {form.bannerUrl && (
              <img
                src={form.bannerUrl}
                alt="Banner"
                className="h-16 w-full rounded-lg border object-cover"
              />
            )}
            <Input
              id="bannerUrl"
              type="file"
              accept="image/*"
              disabled={uploadingBanner}
              onChange={(e) => handleFileUpload(e, "bannerUrl", setUploadingBanner)}
              className="cursor-pointer file:mr-2 file:text-muted-foreground"
            />
            {uploadingBanner && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3 animate-pulse" /> Subiendo...
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Mostrar banner</p>
            <p className="text-xs text-muted-foreground">
              Muestra la imagen/tagline destacada en el inicio de la tienda.
            </p>
          </div>
          <Switch
            checked={form.showBanner ?? true}
            onCheckedChange={(v) => handleField("showBanner", v)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Mostrar newsletter</p>
            <p className="text-xs text-muted-foreground">
              Sección para que los visitantes dejen su email.
            </p>
          </div>
          <Switch
            checked={form.showNewsletter ?? true}
            onCheckedChange={(v) => handleField("showNewsletter", v)}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Badges de confianza
            </h3>
            <p className="text-xs text-muted-foreground">
              Ej: "Envío gratis", "Garantía 12 meses". Máximo {MAX_BADGES}.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBadge}
            disabled={badges.length >= MAX_BADGES}
          >
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>

        {badges.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no agregaste ningún badge.
          </p>
        )}

        {badges.map((badge, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder="Título (ej: Envío gratis)"
                value={badge.title}
                onChange={(e) => updateBadge(index, "title", e.target.value)}
              />
              <Input
                placeholder="Subtítulo (ej: En compras +$50.000)"
                value={badge.subtitle}
                onChange={(e) => updateBadge(index, "subtitle", e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => removeBadge(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-tight">Contacto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Email de contacto</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail ?? ""}
              onChange={(e) => handleField("contactEmail", e.target.value)}
              placeholder="contacto@minegocio.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Teléfono de contacto</Label>
            <Input
              id="contactPhone"
              value={form.contactPhone ?? ""}
              onChange={(e) => handleField("contactPhone", e.target.value)}
              placeholder="+54 9 11 1234-5678"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Dirección</Label>
          <Textarea
            id="address"
            value={form.address ?? ""}
            onChange={(e) => handleField("address", e.target.value)}
            placeholder="Av. Siempre Viva 742"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </div>
  );
};
