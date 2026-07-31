import { useBranding, useUpdateBranding } from "../components/hooks/useBranding";
import { AppBrandingForm } from "../components/molecules/AppBrandingForm";
import { Loader } from "../components/atoms/loader";

export const BrandingSettings = () => {
  const { branding, loading } = useBranding();
  const { updateBranding, loading: isSaving } = useUpdateBranding();

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
    </div>
  );
};

